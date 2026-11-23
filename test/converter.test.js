import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import webp from 'node-webpmux';
import { convertToSticker } from '../src/stickerConverter.js';
import { extractXStatusUrl } from '../src/xExtractor.js';

const execFileAsync = promisify(execFile);

test('extractXStatusUrl parses x.com and twitter.com status links', () => {
  const x = extractXStatusUrl('Check this out https://x.com/user_1/status/1234567890?s=20');
  assert.deepEqual(x, {
    url: 'https://x.com/user_1/status/1234567890',
    user: 'user_1',
    statusId: '1234567890',
  });

  const tw = extractXStatusUrl('https://twitter.com/jack/status/20');
  assert.equal(tw?.statusId, '20');
  assert.equal(extractXStatusUrl('https://google.com'), null);
});

test('convertToSticker creates 512x512 transparent-padded static WebP with dcss EXIF', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'wsb-test-img-'));
  try {
    const samplePng = join(workDir, 'rect.png');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=800x400:d=1',
      '-frames:v',
      '1',
      samplePng,
    ]);
    const inputBuf = await readFile(samplePng);
    const stickerBuf = await convertToSticker(inputBuf, {
      isAnimated: false,
      ext: 'png',
      packName: 'dcss-stickers',
      author: 'dcss',
    });

    assert.ok(stickerBuf.length > 0 && stickerBuf.length <= 100 * 1024);

    const img = new webp.Image();
    await img.load(stickerBuf);
    assert.equal(img.width, 512);
    assert.equal(img.height, 512);

    const exifText = img.exif.toString('utf8');
    assert.ok(exifText.includes('dcss-stickers'));
    assert.ok(exifText.includes('dcss'));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('convertToSticker creates animated WebP under 500KB with EXIF', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'wsb-test-vid-'));
  try {
    const sampleMp4 = join(workDir, 'clip.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=640x360:rate=15',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      sampleMp4,
    ]);
    const inputBuf = await readFile(sampleMp4);
    const stickerBuf = await convertToSticker(inputBuf, {
      isAnimated: true,
      ext: 'mp4',
      packName: 'dcss-stickers',
      author: 'dcss',
      maxVideoSeconds: 8,
    });

    assert.ok(stickerBuf.length > 0 && stickerBuf.length <= 500 * 1024);

    const img = new webp.Image();
    await img.load(stickerBuf);
    assert.equal(img.width, 512);
    assert.equal(img.height, 512);
    assert.ok(img.hasAnim);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('convertToSticker auto-speeds up videos longer than maxVideoSeconds and fits <= 500KB', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'wsb-test-vid-long-'));
  try {
    const sampleMp4 = join(workDir, 'long_clip.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=10:size=640x360:rate=20',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      sampleMp4,
    ]);
    const inputBuf = await readFile(sampleMp4);
    const stickerBuf = await convertToSticker(inputBuf, {
      isAnimated: true,
      ext: 'mp4',
      packName: 'dcss-stickers',
      author: 'dcss',
      maxVideoSeconds: 6,
      videoSpeed: 1.25,
    });

    assert.ok(stickerBuf.length > 0 && stickerBuf.length <= 500 * 1024);

    const img = new webp.Image();
    await img.load(stickerBuf);
    assert.equal(img.width, 512);
    assert.equal(img.height, 512);
    assert.ok(img.hasAnim);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
