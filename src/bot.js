import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from './config.js';
import { convertToSticker } from './stickerConverter.js';
import { extractXStatusUrl, fetchMediaFromX } from './xExtractor.js';

const logger = pino({ level: 'warn' });
const groupSubjectCache = new Map();

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
 * @param {ReturnType<typeof makeWASocket>} sock
 * @param {string} remoteJid
 * @returns {Promise<boolean>}
 */
async function isAuthorizedChat(sock, remoteJid) {
  if (!remoteJid || remoteJid === 'status@broadcast') return false;

  if (remoteJid.endsWith('@g.us')) {
    if (config.allowedGroupJids.includes(remoteJid)) return true;
    if (config.allowedGroupNames.length > 0) {
      const subject = await getGroupSubject(sock, remoteJid);
      return config.allowedGroupNames.includes(subject);
    }
    return false;
  }

  return config.allowedUserJids.includes(remoteJid);
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

  const content = unwrapMessage(msg.message);
  if (!content) return;

  // Prevent infinite loop on stickers sent by the bot itself
  if (msg.key.fromMe && content.stickerMessage) return;

  const text = extractText(content);

  // Helper command to discover the group JID during initial setup
  if (text === '!id' && remoteJid.endsWith('@g.us')) {
    const subject = await getGroupSubject(sock, remoteJid);
    await sock.sendMessage(
      remoteJid,
      { text: `JID del grupo "${subject}":\n${remoteJid}` },
      { quoted: msg },
    );
    return;
  }

  const authorized = await isAuthorizedChat(sock, remoteJid);
  if (!authorized) return;

  const mediaSpec = detectMediaInput(content, text);
  if (!mediaSpec) return;

  await react(sock, remoteJid, msg.key, '⏳');

  try {
    if (mediaSpec.type === 'x-url') {
      const items = await fetchMediaFromX(mediaSpec.text, {
        ytdlpPath: config.ytdlpPath,
      });
      for (const item of items) {
        const sticker = await convertToSticker(item.buffer, {
          isAnimated: item.kind === 'video',
          ext: item.ext,
          packName: config.packName,
          author: config.author,
          maxVideoSeconds: config.maxVideoSeconds,
        });
        await sock.sendMessage(remoteJid, { sticker }, { quoted: msg });
      }
    } else {
      const buffer = await downloadMediaMessage(
        msg,
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
      });
      await sock.sendMessage(remoteJid, { sticker }, { quoted: msg });
    }

    await react(sock, remoteJid, msg.key, '✅');
  } catch (err) {
    console.error('[StickerBot] Error procesando mensaje:', err);
    await react(sock, remoteJid, msg.key, '❌');
    await sock.sendMessage(
      remoteJid,
      { text: `No pude convertir eso a sticker: ${err.message}` },
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
  if (extractXStatusUrl(text)) {
    return { type: 'x-url', text };
  }
  return null;
}

/**
 * Start the WhatsApp socket client with auto-reconnect.
 */
export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      botState.qr = qr;
      botState.status = 'waiting_for_qr';
      console.log('\nEscanea este QR con WhatsApp (Dispositivos vinculados):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      botState.status = 'disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.warn(
        `[StickerBot] Conexión cerrada (code=${statusCode}). Reconectar: ${shouldReconnect}`,
      );
      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000);
      }
    } else if (connection === 'open') {
      botState.qr = null;
      botState.status = 'connected';
      console.log('[StickerBot] Conectado a WhatsApp correctamente.');
      if (
        config.allowedGroupJids.length === 0 &&
        config.allowedGroupNames.length === 0
      ) {
        console.log(
          '[StickerBot] Sin grupos configurados aún. Envía "!id" en tu grupo para obtener su JID.',
        );
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await handleMessage(sock, msg);
    }
  });
}
