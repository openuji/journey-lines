import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadLibav, webmEncoder } from '@openuji/clip-webm';

/** A PNG of one colour, RGB 8-bit, as Chrome's screencast sends them. */
function png(width: number, height: number, [r, g, b]: readonly [number, number, number]): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, deflate, no filter method, no interlace
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rows.set([r, g, b], y * (1 + width * 3) + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', new Uint8Array()),
  ]);
}

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

describe('webmEncoder (vendored libav.js)', () => {
  it('turns PNG pictures into a WebM file, in WebAssembly', async () => {
    const encode = webmEncoder(await loadLibav());
    const clip = encode();
    await clip.add(png(64, 48, [255, 0, 0]), 0);
    await clip.add(png(64, 48, [0, 255, 0]), 16);
    await clip.add(png(64, 48, [0, 0, 255]), 32);
    const { mimeType, bytes } = await clip.finish(282);

    expect(mimeType).toBe('video/webm');
    expect([...bytes.subarray(0, 4)]).toEqual(EBML_MAGIC);
    expect(new TextDecoder('latin1').decode(bytes)).toContain('webm');
  });

  it('keeps going when the window is resized mid-scroll', async () => {
    const clip = webmEncoder(await loadLibav())();
    await clip.add(png(64, 48, [10, 20, 30]), 0);
    await clip.add(png(80, 60, [30, 20, 10]), 16);

    const { bytes } = await clip.finish(266);
    expect([...bytes.subarray(0, 4)]).toEqual(EBML_MAGIC);
  });

  it('encodes clips one after another and side by side, each into its own file', async () => {
    const encode = webmEncoder(await loadLibav());
    const [a, b] = [encode(), encode()];
    await a.add(png(32, 32, [0, 0, 0]), 0);
    await b.add(png(32, 32, [255, 255, 255]), 0);
    await a.add(png(32, 32, [9, 9, 9]), 16);

    const [fileA, fileB] = await Promise.all([a.finish(266), b.finish(250)]);
    expect(fileA.bytes).not.toEqual(fileB.bytes);
  });

  it('rejects what is not a PNG, and an empty clip', async () => {
    const encode = webmEncoder(await loadLibav());
    await expect(encode().add(new TextEncoder().encode('not a png'), 0)).rejects.toThrow();
    await expect(encode().finish(250)).rejects.toThrow('A clip needs at least one picture');
  });

  it('frees an aborted clip, before or after its first picture', async () => {
    const encode = webmEncoder(await loadLibav());
    await expect(encode().abort()).resolves.toBeUndefined();
    const clip = encode();
    await clip.add(png(16, 16, [1, 2, 3]), 0);
    await expect(clip.abort()).resolves.toBeUndefined();
  });
});
