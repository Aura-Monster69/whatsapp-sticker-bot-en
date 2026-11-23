import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const X_URL_REGEX =
  /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/i;

/**
 * Extract the first X/Twitter status URL and its user/statusId from text.
 * @param {string} text
 * @returns {{ url: string, user: string, statusId: string } | null}
 */
export function extractXStatusUrl(text) {
  if (!text) return null;
  const match = text.match(X_URL_REGEX);
  if (!match) return null;
  return {
    url: match[0],
    user: match[1],
    statusId: match[2],
  };
}

/**
 * Download a binary resource into a Buffer.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function downloadBuffer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'whatsapp-sticker-bot/1.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Download video from an X/Twitter URL using yt-dlp as fallback.
 * @param {string} url
 * @param {string} ytdlpPath
 * @returns {Promise<Array<{ kind: 'video', buffer: Buffer, ext: string }>>}
 */
async function downloadWithYtDlp(url, ytdlpPath) {
  const workDir = await mkdtemp(join(tmpdir(), 'wsb-ytdlp-'));
  const outputTemplate = join(workDir, 'media.%(ext)s');
  try {
    await execFileAsync(ytdlpPath, [
      '--no-playlist',
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '-o',
      outputTemplate,
      url,
    ]);
    const filePath = join(workDir, 'media.mp4');
    const buffer = await readFile(filePath);
    return [{ kind: 'video', buffer, ext: 'mp4' }];
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Fetch image(s) or video/GIF from an X/Twitter status URL.
 * Uses fxtwitter JSON API first and falls back to yt-dlp for videos.
 * @param {string} textOrUrl
 * @param {{ ytdlpPath?: string }} [options]
 * @returns {Promise<Array<{ kind: 'image' | 'video', buffer: Buffer, ext: string }>>}
 */
export async function fetchMediaFromX(textOrUrl, options = {}) {
  const parsed = extractXStatusUrl(textOrUrl);
  if (!parsed) {
    throw new Error('No valid X/Twitter link found.');
  }

  const ytdlpPath = options.ytdlpPath || 'yt-dlp';
  const apiUrl = `https://api.fxtwitter.com/${parsed.user}/status/${parsed.statusId}`;

  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'whatsapp-sticker-bot/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const mediaAll = data?.tweet?.media?.all || [];
      if (mediaAll.length > 0) {
        const results = [];
        for (const item of mediaAll) {
          if (item.type === 'photo' && item.url) {
            const buffer = await downloadBuffer(item.url);
            results.push({ kind: 'image', buffer, ext: 'jpg' });
          } else if ((item.type === 'video' || item.type === 'gif') && item.url) {
            const buffer = await downloadBuffer(item.url);
            results.push({ kind: 'video', buffer, ext: 'mp4' });
          }
        }
        if (results.length > 0) {
          return results;
        }
      }
    }
  } catch {
    // Fall through to yt-dlp fallback
  }

  return downloadWithYtDlp(parsed.url, ytdlpPath);
}
