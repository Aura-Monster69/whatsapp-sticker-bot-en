import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { rename } from 'node:fs/promises';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from './config.js';
import { convertToSticker } from './stickerConverter.js';
import { extractXStatusUrl, fetchMediaFromX } from './xExtractor.js';

const logger = pino({ level: 'warn' });
const groupSubjectCache = new Map();

// Never run two sockets against the same auth_info folder: both would consume
// the same Signal ratchets and corrupt each other's sessions.
let activeSocket = null;
let reconnectTimer = null;
let startInProgress = false;
let authResetInProgress = false;

const AUTH_DIR = 'auth_info';

/**
 * WhatsApp only sends a pairing QR when creds.me is empty. After the device is
 * unlinked from the phone, the stored `me` identity is dead but still present,
 * so Baileys keeps logging in with it, gets a 401, and never generates a QR.
 * Move the stale auth folder aside so the next start begins a fresh pairing.
 */
async function resetAuthState() {
  const backup = `${AUTH_DIR}.logged-out-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`;
  try {
    await rename(AUTH_DIR, backup);
    console.log(`[StickerBot] Moved stale auth state to ${backup}`);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
}

export const botState = {
  status: 'starting',
  qr: null,
};

/**
 * Unwrap nested ephemeral/view-once message wrappers from Baileys.
 * @param {import('@whiskeysockets/baileys').proto.IMessage | undefined} message
 */
function unwrapMessage(message) {
  let current = message;
  while (current) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
    } else if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
    } else if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
    } else if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Extract plain text or caption from an unwrapped message.
 * @param {import('@whiskeysockets/baileys').proto.IMessage} content
 * @returns {string}
 */
function extractText(content) {
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ''
  ).trim();
}

/**
 * Resolve and cache a WhatsApp group's subject name.
 * @param {ReturnType<typeof makeWASocket>} sock
 * @param {string} jid
 * @returns {Promise<string>}
 */
async function getGroupSubject(sock, jid) {
  if (groupSubjectCache.has(jid)) {
    return groupSubjectCache.get(jid);
  }
  try {
    const meta = await sock.groupMetadata(jid);
    const subject = meta?.subject || '';
    groupSubjectCache.set(jid, subject);
    return subject;
  } catch {
    return '';
  }
}

/**
 * Check whether a chat JID is authorized to use the bot.
 * Restricts access strictly to the configured group ("Sticka") and nowhere else.
 * @param {ReturnType<typeof makeWASocket>} sock
 * @param {string} remoteJid
 * @returns {Promise<boolean>}
 */
async function isAuthorizedChat(sock, remoteJid) {
  if (!remoteJid || remoteJid === 'status@broadcast') return false;

  const normalized = jidNormalizedUser(remoteJid);

  // Strictly block all direct messages (DMs) — only work in group
  if (!normalized.endsWith('@g.us')) {
    return false;
  }

  // Check if group JID is explicitly allowed
  if (config.allowedGroupJids.includes(normalized)) {
    return true;
  }

  // Check if group name matches allowed group names (e.g. "Sticka")
  if (config.allowedGroupNames.length > 0) {
    const subject = await getGroupSubject(sock, normalized);
    return config.allowedGroupNames.includes(subject);
  }

  return false;
}

/**
 * Send a reaction emoji to a message (best-effort).
 * @param {ReturnType<typeof makeWASocket>} sock
 * @param {string} jid
 * @param {import('@whiskeysockets/baileys').proto.IMessageKey} key
 * @param {string} emoji
 */
async function react(sock, jid, key, emoji) {
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key } });
  } catch {
    // Reactions are non-critical
  }
}

/**
 * Process a single incoming WhatsApp message.
 * @param {ReturnType<typeof makeWASocket>} sock
 * @param {import('@whiskeysockets/baileys').proto.IWebMessageInfo} msg
 */
async function handleMessage(sock, msg) {
  const remoteJid = msg.key?.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') return;

  // Log if the message arrived but failed to decrypt (session key mismatch)
  if (!msg.message) {
    if (msg.messageStubType) {
      console.warn(`[StickerBot] ⚠ Message from ${remoteJid} failed to decrypt (stubType=${msg.messageStubType}). Session out of sync — restart the bot or clear auth_info.`);
    }
    return;
  }

  const content = unwrapMessage(msg.message);
  if (!content) return;

  // Prevent infinite loop on stickers sent by the bot itself
  if (msg.key.fromMe && content.stickerMessage) return;

  const text = extractText(content);
  const normalizedJid = jidNormalizedUser(remoteJid);

  console.log(
    `[StickerBot] Message from ${normalizedJid} (fromMe=${Boolean(msg.key?.fromMe)}): "${text || '[media]'}"`,
  );

  // Helper command to discover the JID during initial setup
  if (text === '!id') {
    const subject = groupSubjectCache.get(normalizedJid) || '';
    const label = normalizedJid.endsWith('@g.us')
      ? `Group JID${subject ? ` "${subject}"` : ''}:\n${normalizedJid}`
      : `Your user JID is:\n${normalizedJid}`;
    try {
      await sock.sendMessage(remoteJid, { text: label }, { quoted: msg });
    } catch {
      await sock.sendMessage(remoteJid, { text: label });
    }
    return;
  }

  const authorized = await isAuthorizedChat(sock, remoteJid);
  if (!authorized) {
    const subject = normalizedJid.endsWith('@g.us')
      ? await getGroupSubject(sock, normalizedJid)
      : '';
    console.log(
      `[StickerBot] Message ignored from unauthorized chat: ${normalizedJid}` +
        (subject ? ` ("${subject}")` : ''),
    );
    return;
  }

  let mediaSpec = detectMediaInput(content, text);
  let mediaMsg = msg;

  // If direct message has no convertible media, check if it quotes a media message
  if (!mediaSpec) {
    const quoted = content.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const quotedContent = unwrapMessage(quoted);
      if (quotedContent) {
        const quotedSpec = detectMediaInput(quotedContent, text);
        if (quotedSpec) {
          mediaSpec = quotedSpec;
          mediaMsg = {
            key: {
              remoteJid,
              id: content.extendedTextMessage?.contextInfo?.stanzaId,
              participant: content.extendedTextMessage?.contextInfo?.participant,
            },
            message: quoted,
          };
        }
      }
    }
  }

  if (!mediaSpec) return;

  console.log(`[StickerBot] Processing sticker (${mediaSpec.type}) for ${normalizedJid}...`);
  await react(sock, remoteJid, msg.key, '⏳');

  try {
    if (mediaSpec.type === 'x-url') {
      const items = await fetchMediaFromX(mediaSpec.url || mediaSpec.text, {
        ytdlpPath: config.ytdlpPath,
      });
      for (const item of items) {
        const sticker = await convertToSticker(item.buffer, {
          isAnimated: item.kind === 'video',
          ext: item.ext,
          packName: config.packName,
          author: config.author,
          maxVideoSeconds: config.maxVideoSeconds,
          videoSpeed: config.videoSpeed,
        });
        try {
          await sock.sendMessage(remoteJid, { sticker }, { quoted: msg });
        } catch {
          await sock.sendMessage(remoteJid, { sticker });
        }
      }
    } else {
      const buffer = await downloadMediaMessage(
        mediaMsg,
        'buffer',
        {},
        { logger, reuploadRequest: sock.updateMediaMessage },
      );
      const sticker = await convertToSticker(buffer, {
        isAnimated: mediaSpec.isAnimated,
        ext: mediaSpec.ext,
        packName: config.packName,
        author: config.author,
        maxVideoSeconds: config.maxVideoSeconds,
        videoSpeed: config.videoSpeed,
      });
      try {
        await sock.sendMessage(remoteJid, { sticker }, { quoted: msg });
      } catch {
        await sock.sendMessage(remoteJid, { sticker });
      }
    }

    await react(sock, remoteJid, msg.key, '✅');
  } catch (err) {
    console.error('[StickerBot] Error processing message:', err);
    await react(sock, remoteJid, msg.key, '❌');
    await sock.sendMessage(
      remoteJid,
      { text: `Could not convert that to a sticker: ${err.message}` },
      { quoted: msg },
    );
  }
}

/**
 * Determine whether an incoming message contains convertible media or an X link.
 * @param {import('@whiskeysockets/baileys').proto.IMessage} content
 * @param {string} text
 */
function detectMediaInput(content, text) {
  if (content.imageMessage) {
    return { type: 'media', isAnimated: false, ext: 'jpg' };
  }
  if (content.videoMessage) {
    return { type: 'media', isAnimated: true, ext: 'mp4' };
  }
  if (content.documentMessage) {
    const mime = content.documentMessage.mimetype || '';
    if (mime.startsWith('image/')) {
      const isGif = mime === 'image/gif';
      return { type: 'media', isAnimated: isGif, ext: isGif ? 'gif' : 'png' };
    }
    if (mime.startsWith('video/')) {
      return { type: 'media', isAnimated: true, ext: 'mp4' };
    }
  }
  const xMatch = extractXStatusUrl(text);
  if (xMatch) {
    return { type: 'x-url', url: xMatch.url, text };
  }
  return null;
}

/**
 * Start the WhatsApp socket client with auto-reconnect.
 */
export async function startBot() {
  if (startInProgress) return;
  startInProgress = true;

  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      fireInitQueries: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: false,
    });
    activeSocket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        botState.qr = qr;
        botState.status = 'waiting_for_qr';
        console.log('\nScan this QR code with WhatsApp (Linked Devices):');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'close') {
        botState.status = 'disconnected';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn(
          `[StickerBot] Connection closed (code=${statusCode}). Reconnect: ${shouldReconnect}`,
        );

        if (activeSocket === sock) activeSocket = null;

        // The phone unlinked this device, or WhatsApp rejected the stored
        // identity. Drop the dead credentials and start pairing again so the
        // QR flow can actually run.
        if (statusCode === DisconnectReason.loggedOut) {
          if (!authResetInProgress) {
            authResetInProgress = true;
            console.warn(
              '[StickerBot] Device was unlinked. Clearing stale credentials; a new QR code will be generated.',
            );
            setTimeout(async () => {
              try {
                await resetAuthState();
                await startBot();
              } catch (err) {
                console.error('[StickerBot] Failed to reset auth state:', err);
              } finally {
                authResetInProgress = false;
              }
            }, 1000);
          }
          return;
        }

        // Schedule at most one reconnect. Multiple sockets sharing auth_info
        // would corrupt the Signal sessions.
        if (shouldReconnect && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startBot().catch((err) => {
              console.error('[StickerBot] Reconnect failed:', err);
            });
          }, 3000);
        }
      } else if (connection === 'open') {
        botState.qr = null;
        botState.status = 'connected';
        console.log('[StickerBot] Connected to WhatsApp successfully.');

        // Mark the bot presence as unavailable/offline so your account doesn't stay "Online" 24/7
        sock.sendPresenceUpdate('unavailable').catch(() => {});

        if (
          config.allowedGroupJids.length === 0 &&
          config.allowedGroupNames.length === 0
        ) {
          console.log(
            '[StickerBot] No groups configured yet. Send "!id" in your group to get its JID.',
          );
        }

        if (process.env.DIAG === '1') {
          for (const jid of config.allowedGroupJids) {
            try {
              const meta = await sock.groupMetadata(jid);
              console.log(
                `[StickerBot][diag] configured group ${jid} => "${meta.subject}" (${meta.participants?.length ?? 0} participants)`,
              );
            } catch (err) {
              console.warn(
                `[StickerBot][diag] configured group ${jid} metadata failed: ${err.message}`,
              );
            }
          }
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (process.env.DIAG === '1') {
        for (const msg of messages) {
          console.log(
            `[StickerBot][diag] upsert type=${type} chat=${msg.key?.remoteJid} ` +
              `fromMe=${Boolean(msg.key?.fromMe)} participant=${msg.key?.participant || '-'} ` +
              `stub=${msg.messageStubType ?? '-'} hasContent=${Boolean(msg.message)}`,
          );
        }
      }

      for (const msg of messages) {
        await handleMessage(sock, msg);
      }
    });
  } finally {
    startInProgress = false;
  }
}
