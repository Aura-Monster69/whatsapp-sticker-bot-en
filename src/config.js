import 'dotenv/config';

/**
 * Parse a comma-separated environment variable into a trimmed string array.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function parseCsvList(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  packName: process.env.STICKER_PACK_NAME || 'dcss-stickers',
  author: process.env.STICKER_AUTHOR || 'dcss',
  allowedGroupJids: parseCsvList(process.env.ALLOWED_GROUP_JIDS),
  allowedGroupNames: parseCsvList(process.env.ALLOWED_GROUP_NAMES),
  allowedUserJids: parseCsvList(process.env.ALLOWED_USER_JIDS),
  maxVideoSeconds: Math.max(1, Number(process.env.MAX_VIDEO_SECONDS) || 6),
  videoSpeed: Math.max(0.5, Number(process.env.VIDEO_SPEED) || 1.0),
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
};
