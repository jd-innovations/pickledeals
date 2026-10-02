/**
 * UTF-8 <-> bytes without relying on TextEncoder/TextDecoder, whose availability differs between
 * Hermes versions. Used to encrypt the persisted auth session.
 */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const cont = () => (bytes[i++] ?? 0) & 63;
  while (i < bytes.length) {
    const b = bytes[i++] ?? 0;
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 31) << 6) | cont();
    else if (b < 0xf0) cp = ((b & 15) << 12) | (cont() << 6) | cont();
    else cp = ((b & 7) << 18) | (cont() << 12) | (cont() << 6) | cont();
    out += String.fromCodePoint(cp);
  }
  return out;
}
