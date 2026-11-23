/**
 * Baileys 6.7.24 only tries to decrypt a message using one identity form
 * (phone-number JID or LID). When the stored Signal session was created under
 * the other form, decryption fails with "Bad MAC" / "No matching sessions
 * found" even though a usable session exists.
 *
 * WhatsApp includes the alternate identity on the stanza itself
 * (sender_pn/sender_lid for direct messages, participant_pn/participant_lid
 * for groups. This patch retries once with that identity.
 *
 * Upstream discussion: https://github.com/WhiskeySockets/Baileys/pull/2763
 *
 * The patch is applied on postinstall because the fix has not been published to
 * an npm release. If Baileys is upgraded, this script becomes a no-op and
 * prints a warning instead of failing the install.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve(
  process.cwd(),
  'node_modules/@whiskeysockets/baileys/lib/Utils/decode-wa-message.js',
);

const MARKER = 'stanza-provided PN/LID pairing';

const original = `                            case 'pkmsg':
                            case 'msg':
                                const user = isJidUser(sender) ? sender : author;
                                msgBuffer = await repository.decryptMessage({
                                    jid: user,
                                    type: e2eType,
                                    ciphertext: content
                                });
                                break;`;

const patched = `                            case 'pkmsg':
                            case 'msg': {
                                const user = isJidUser(sender) ? sender : author;
                                try {
                                    msgBuffer = await repository.decryptMessage({
                                        jid: user,
                                        type: e2eType,
                                        ciphertext: content
                                    });
                                }
                                catch (err) {
                                    // WhatsApp tags the stanza with both identity forms
                                    // whenever it knows the pairing. If the primary
                                    // address has no usable session, retry once with the
                                    // other form before giving up. This fixes persistent
                                    // Bad MAC on self-sync messages from other linked
                                    // devices and on contacts mid-migration to LID.
                                    const altUser = isLidUser(user)
                                        ? stanza.attrs.participant_pn || stanza.attrs.sender_pn
                                        : stanza.attrs.participant_lid || stanza.attrs.sender_lid;
                                    if (!altUser || altUser === user) {
                                        throw err;
                                    }
                                    logger.debug({ key: fullMessage.key, primary: user, retryWith: altUser }, 'primary identity failed to decrypt, retrying with stanza-provided PN/LID pairing');
                                    try {
                                        msgBuffer = await repository.decryptMessage({
                                            jid: altUser,
                                            type: e2eType,
                                            ciphertext: content
                                        });
                                    }
                                    catch {
                                        // Preserve the original, more informative error.
                                        throw err;
                                    }
                                }
                                break;
                            }`;

if (!existsSync(file)) {
  console.warn('[patch-baileys-lid] Baileys decrypt file not found; skipping.');
  process.exit(0);
}

let source = await readFile(file, 'utf8');

if (source.includes(MARKER)) {
  console.log('[patch-baileys-lid] Patch already applied.');
  process.exit(0);
}

if (!source.includes(original)) {
  console.warn(
    '[patch-baileys-lid] Expected Baileys 6.7.24 decrypt block not found. ' +
      'Skipping patch (the installed version may already handle this).',
  );
  process.exit(0);
}

source = source.replace(original, patched);
await writeFile(file, source);
console.log('[patch-baileys-lid] Applied LID/PN decrypt retry patch.');
