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
 * Probe media duration in seconds using ffprobe.
 * @param {string} filePath
 * @returns {Promise<number | null>}
 */
async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const dur = parseFloat(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  }
}

/**
 * Build the FFmpeg video/image filter that preserves aspect ratio with
 * 100% transparent borders inside a 512x512 canvas and optionally speeds up playback.
 * @param {number | null} fps
 * @param {number | null} speedMultiplier
 * @returns {string}
 */
function buildTransparentContainFilter(fps = null, speedMultiplier = null) {
  const parts = [];
  if (speedMultiplier && speedMultiplier > 1.01) {
    parts.push(`setpts=PTS/${speedMultiplier.toFixed(3)}`);
  }
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
 *   videoSpeed?: number,
 * }} options
 * @returns {Promise<Buffer>}
 */
export async function convertToSticker(inputBuffer, options) {
  const {
    isAnimated,
    ext = isAnimated ? 'mp4' : 'png',
    packName = 'dcss-stickers',
    author = 'dcss',
    maxVideoSeconds = 6,
    videoSpeed = 1.0,
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
      const rawDuration = await probeDuration(inputPath);
      const targetDuration = Math.max(1, maxVideoSeconds);

      // Dynamic Speed Scaling:
      // - If video duration <= targetDuration: speed is 1.0 (normal speed, no modification).
      // - If video duration > targetDuration: speed is increased proportionally (duration / targetDuration)
      //   so the ENTIRE video is captured without truncating the ending.
      const autoSpeed =
        rawDuration && rawDuration > targetDuration
          ? rawDuration / targetDuration
          : 1.0;

      const baseSpeed = Math.max(0.5, Number(videoSpeed) || 1.0);
      const initialSpeed = Math.min(Math.max(autoSpeed, baseSpeed), 3.5);

      const outputDuration = rawDuration
        ? Math.min(rawDuration / initialSpeed, targetDuration)
        : targetDuration;

      // Compression passes: adjust FPS, quality, and add speedboost for complex/heavy videos
      const passes = [
        { fps: 14, quality: 55, speedBoost: 1.0 },
        { fps: 11, quality: 38, speedBoost: 1.0 },
        { fps: 9, quality: 25, speedBoost: 1.0 },
        { fps: 8, quality: 20, speedBoost: 1.2 }, // extra boost for unusually large/heavy files
      ];

      for (const pass of passes) {
        const passSpeed = Math.min(initialSpeed * pass.speedBoost, 4.0);
        const passDuration = rawDuration
          ? Math.min(rawDuration / passSpeed, targetDuration)
          : outputDuration;

        await execFileAsync('ffmpeg', [
          '-y',
          '-i',
          inputPath,
          '-t',
          String(passDuration.toFixed(2)),
          '-vf',
          buildTransparentContainFilter(pass.fps, passSpeed),
          '-vcodec',
          'libwebp',
          '-loop',
          '0',
          '-preset',
          'default',
          '-an',
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
