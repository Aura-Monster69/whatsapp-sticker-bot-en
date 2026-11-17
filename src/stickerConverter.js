import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import webp from 'node-webpmux';

const execFileAsync = promisify(execFile);

const STATIC_LIMIT_BYTES = 100 * 1024;
const ANIMATED_LIMIT_BYTES = 500 * 1024;

/**
 * Build WhatsApp-compatible EXIF metadata buffer for stickers.
 * @param {string} packName
 * @param {string} author
 * @returns {Buffer}
 */
export function buildExifBuffer(packName, author) {
  const json = {
    'sticker-pack-id': 'com.dcss.whatsapp.stickerbot',
    'sticker-pack-name': packName,
    'sticker-pack-publisher': author,
    emojis: ['✨'],
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([exifAttr, jsonBuf]);
  exif.writeUIntLE(jsonBuf.length, 14, 4);
  return exif;
}

/**
 * Attach WhatsApp EXIF metadata to a WebP buffer.
 * @param {Buffer} webpBuffer
 * @param {string} packName
 * @param {string} author
 * @returns {Promise<Buffer>}
 */
export async function attachExif(webpBuffer, packName, author) {
  const img = new webp.Image();
  await img.load(webpBuffer);
  img.exif = buildExifBuffer(packName, author);
  return img.save(null);
}

/**
 * Build the FFmpeg video/image filter that preserves aspect ratio with
 * 100% transparent borders inside a 512x512 canvas.
 * @param {number | null} fps
 * @returns {string}
 */
function buildTransparentContainFilter(fps = null) {
  const parts = [];
  if (fps) {
    parts.push(`fps=${fps}`);
  }
  parts.push(
    'scale=512:512:force_original_aspect_ratio=decrease',
    'format=rgba',
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0',
    'format=yuva420p',
  );
  return parts.join(',');
}

/**
 * Convert an image, GIF, or video buffer into a 512x512 WhatsApp WebP sticker
 * with transparent padding and EXIF pack/author metadata.
 * @param {Buffer} inputBuffer
 * @param {{
 *   isAnimated: boolean,
 *   ext?: string,
 *   packName?: string,
 *   author?: string,
 *   maxVideoSeconds?: number,
 * }} options
 * @returns {Promise<Buffer>}
 */
export async function convertToSticker(inputBuffer, options) {
  const {
    isAnimated,
    ext = isAnimated ? 'mp4' : 'png',
    packName = 'dcss-stickers',
    author = 'dcss',
    maxVideoSeconds = 8,
  } = options;

  const workDir = await mkdtemp(join(tmpdir(), 'wsb-conv-'));
  const inputPath = join(workDir, `input.${ext}`);
  const outputPath = join(workDir, 'output.webp');

  try {
    await writeFile(inputPath, inputBuffer);

    let webpBuffer;
    if (!isAnimated) {
      const qualities = [80, 55, 35];
      for (const quality of qualities) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-i',
          inputPath,
          '-vf',
          buildTransparentContainFilter(null),
          '-vcodec',
          'libwebp',
          '-lossless',
          '0',
          '-compression_level',
          '6',
          '-q:v',
          String(quality),
          outputPath,
        ]);
        webpBuffer = await readFile(outputPath);
        if (webpBuffer.length <= STATIC_LIMIT_BYTES) break;
      }
    } else {
      const passes = [
        { fps: 15, quality: 60, duration: maxVideoSeconds },
        { fps: 12, quality: 40, duration: Math.min(maxVideoSeconds, 6) },
        { fps: 10, quality: 25, duration: Math.min(maxVideoSeconds, 5) },
      ];
      for (const pass of passes) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-t',
          String(pass.duration),
          '-i',
          inputPath,
          '-vf',
          buildTransparentContainFilter(pass.fps),
          '-vcodec',
          'libwebp',
          '-loop',
          '0',
          '-preset',
          'default',
          '-an',
          '-vsync',
          '0',
          '-q:v',
          String(pass.quality),
          outputPath,
        ]);
        webpBuffer = await readFile(outputPath);
        if (webpBuffer.length <= ANIMATED_LIMIT_BYTES) break;
      }
    }

    return attachExif(webpBuffer, packName, author);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
