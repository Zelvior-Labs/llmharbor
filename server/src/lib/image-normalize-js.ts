import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

// Pure-JS image resizing for hosts that cannot load sharp: the Android APK, a
// slim container with no matching prebuild, or an x64 CPU without SSE4.2.
//
// Deliberately narrow: JPEG and PNG only, with a hard pixel and byte ceiling,
// because decoding happens on the same heap as the gateway. Anything larger or
// unknown rides through untouched, exactly as it did when sharp was missing.

/** ~4MP: an 8MP decode is 32MB of RGBA before any resizing. */
const MAX_PIXELS = 4_000_000;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export interface JsNormalizeOptions {
  maxDimension: number;
  quality: number;
}

export interface JsNormalizedImage {
  buffer: Buffer;
  mime: string;
}

interface Decoded {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel. */
  data: Uint8Array;
}

/** PNG IHDR or the first JPEG SOFn, without decoding pixel data. */
export function imageSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (length < 2) return null;
      offset += 2 + length;
    }
  }
  return null;
}

function decode(buffer: Buffer, mime: string): Decoded | null {
  if (mime === 'image/png') {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (mime === 'image/jpeg') {
    const image = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxMemoryUsageInMB: 256 });
    return { width: image.width, height: image.height, data: image.data as Uint8Array };
  }
  return null;
}

/** Box-average downscale in RGBA space; never enlarges. */
export function downscale(source: Decoded, maxDimension: number): Decoded {
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  if (width === source.width && height === source.height) return source;

  const out = new Uint8Array(width * height * 4);
  const xRatio = source.width / width;
  const yRatio = source.height / height;
  for (let y = 0; y < height; y += 1) {
    const yStart = Math.floor(y * yRatio);
    const yEnd = Math.max(yStart + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x += 1) {
      const xStart = Math.floor(x * xRatio);
      const xEnd = Math.max(xStart + 1, Math.floor((x + 1) * xRatio));
      let r = 0; let g = 0; let b = 0; let a = 0; let pixels = 0;
      for (let sy = yStart; sy < yEnd && sy < source.height; sy += 1) {
        let index = (sy * source.width + xStart) * 4;
        for (let sx = xStart; sx < xEnd && sx < source.width; sx += 1) {
          r += source.data[index]; g += source.data[index + 1];
          b += source.data[index + 2]; a += source.data[index + 3];
          index += 4; pixels += 1;
        }
      }
      if (pixels === 0) pixels = 1;
      const target = (y * width + x) * 4;
      out[target] = Math.round(r / pixels);
      out[target + 1] = Math.round(g / pixels);
      out[target + 2] = Math.round(b / pixels);
      out[target + 3] = Math.round(a / pixels);
    }
  }
  return { width, height, data: out };
}

function hasTransparency(image: Decoded): boolean {
  // Samples every other row and column: enough to tell screenshots (opaque)
  // from diagrams with a real alpha channel without a full second pass.
  for (let index = 3; index < image.data.length; index += 4 * 2) {
    if (image.data[index] < 250) return true;
  }
  return false;
}

export async function normalizeImageInJs(
  buffer: Buffer,
  mime: string,
  options: JsNormalizeOptions,
): Promise<JsNormalizedImage | null> {
  if (buffer.length > MAX_INPUT_BYTES) return null;
  const size = imageSize(buffer);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  if (size.width * size.height > MAX_PIXELS) return null;

  const decoded = decode(buffer, mime);
  if (!decoded) return null;
  const resized = downscale(decoded, options.maxDimension);
  const transparent = hasTransparency(resized);

  let output: Buffer;
  let outputMime: string;
  if (transparent) {
    const png = new PNG({ width: resized.width, height: resized.height });
    png.data = Buffer.from(resized.data.buffer, resized.data.byteOffset, resized.data.byteLength);
    output = PNG.sync.write(png, { deflateLevel: 6, colorType: 6 });
    outputMime = 'image/png';
  } else {
    const rgb = Buffer.alloc(resized.width * resized.height * 3);
    for (let source = 0, target = 0; source < resized.data.length; source += 4, target += 3) {
      // Flatten onto white, matching the sharp path.
      const alpha = resized.data[source + 3] / 255;
      rgb[target] = Math.round(resized.data[source] * alpha + 255 * (1 - alpha));
      rgb[target + 1] = Math.round(resized.data[source + 1] * alpha + 255 * (1 - alpha));
      rgb[target + 2] = Math.round(resized.data[source + 2] * alpha + 255 * (1 - alpha));
    }
    output = jpeg.encode({ data: rgb, width: resized.width, height: resized.height }, options.quality).data;
    outputMime = 'image/jpeg';
  }
  if (output.length >= buffer.length) return null;
  return { buffer: output, mime: outputMime };
}
