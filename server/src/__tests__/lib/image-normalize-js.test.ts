import { describe, it, expect } from 'vitest';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { imageSize, downscale, normalizeImageInJs } from '../../lib/image-normalize-js.js';

// The Android APK cannot load sharp's libvips prebuild, so oversized images are
// resized by this pure-JS path instead. These tests pin the ceiling that keeps
// it safe on a phone heap and the format/transparency decisions the sharp path
// makes, so the two stay interchangeable for JPEG and PNG payloads.
function noise(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i * 37) & 0xff;
    data[i + 1] = (i * 91) & 0xff;
    data[i + 2] = (i * 13) & 0xff;
    data[i + 3] = 255;
  }
  return data;
}

function jpegOf(width: number, height: number): Buffer {
  const rgba = noise(width, height);
  const rgb = Buffer.alloc(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    rgb[target] = rgba[source]; rgb[target + 1] = rgba[source + 1]; rgb[target + 2] = rgba[source + 2];
  }
  return jpeg.encode({ data: rgb, width, height }, 92).data;
}

function pngOf(width: number, height: number, alpha: number): Buffer {
  const png = new PNG({ width, height });
  png.data = noise(width, height);
  if (alpha < 255) {
    for (let i = 3; i < png.data.length; i += 4) png.data[i] = alpha;
  }
  return PNG.sync.write(png);
}

describe('pure-JS image normalization', () => {
  it('reads dimensions without decoding pixels', () => {
    expect(imageSize(jpegOf(300, 200))).toEqual({ width: 300, height: 200 });
    expect(imageSize(pngOf(64, 48, 255))).toEqual({ width: 64, height: 48 });
    expect(imageSize(Buffer.from('not an image'))).toBeNull();
  });

  it('downscales a large JPEG to the cap and beats the original size', async () => {
    const original = jpegOf(2500, 1500);
    const result = await normalizeImageInJs(original, 'image/jpeg', { maxDimension: 1024, quality: 80 });
    expect(result).not.toBeNull();
    expect(result!.mime).toBe('image/jpeg');
    expect(result!.buffer.length).toBeLessThan(original.length);
    expect(imageSize(result!.buffer)).toEqual({ width: 1024, height: 614 });
  });

  it('turns an opaque screenshot PNG into JPEG', async () => {
    const original = pngOf(1200, 900, 255);
    const result = await normalizeImageInJs(original, 'image/png', { maxDimension: 800, quality: 85 });
    expect(result?.mime).toBe('image/jpeg');
    expect(result!.buffer.length).toBeLessThan(original.length);
  });

  it('keeps a genuinely transparent PNG as PNG', async () => {
    const original = pngOf(1000, 800, 120);
    const result = await normalizeImageInJs(original, 'image/png', { maxDimension: 500, quality: 85 });
    expect(result?.mime).toBe('image/png');
    expect(imageSize(result!.buffer)).toEqual({ width: 500, height: 400 });
  });

  it('refuses images past the decoding ceiling instead of risking the heap', async () => {
    const header = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
    header.writeUInt32BE(13, 8);
    header.write('IHDR', 12, 'ascii');
    header.writeUInt32BE(9000, 16);
    header.writeUInt32BE(9000, 20);
    expect(await normalizeImageInJs(header, 'image/png', { maxDimension: 2048, quality: 80 })).toBeNull();
  });

  it('never enlarges and never returns a bigger file', async () => {
    const small = pngOf(64, 64, 255);
    expect(await normalizeImageInJs(small, 'image/png', { maxDimension: 2048, quality: 90 })).toBeNull();
    const decoded = { width: 4, height: 4, data: new Uint8Array(64) };
    expect(downscale(decoded, 2048)).toBe(decoded);
  });
});
