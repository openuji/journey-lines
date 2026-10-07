/**
 * Base64 helpers for compositor frames and the videos made of them.
 *
 * Frames arrive at up to 60fps but only a handful are ever captured, so they
 * stay base64 until a sink needs the bytes. No helper uses `Buffer`: `atob`
 * and `btoa` exist in Node, browsers and extension service workers alike.
 */

export function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  // In chunks: one `fromCharCode` call per byte would be slow, and one for all
  // of a clip would exceed the argument limit.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Decoded size of a base64 string, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
