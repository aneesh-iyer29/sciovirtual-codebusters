/* =========================================================================
   relaycrypto.mjs: code-gated obfuscation of the "next round" link.

   The SAME algorithm is mirrored, byte-for-byte, in assets/js/relay.js (the
   browser side). A link encrypted here with enc() decrypts there with dec()
   only when the student types the matching code — the code lives only in a
   Google Form's confirmation message, never in the page source.

     enc(link, code) -> base64 blob        (build time, here)
     dec(blob, code) -> link | null        (runtime, in relay.js)

   This is NOT real cryptography. It keeps the next-round path out of view-source
   unless you have the code, which is enough to stop URL-phishing / jumping ahead.
   It is not a vault, and the cipher *answers* still live in the page (the browser
   has to check them). Keep the two copies in sync if you ever touch this.
   ========================================================================= */

const MAGIC = "OK1:";

/** cyrb53 string hash -> 53-bit number. Deterministic across Node and browsers. */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32 PRNG: seeded keystream, identical in Node and browsers. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** XOR each char of `text` with a keystream seeded from `code`. Symmetric. */
function xorText(text, code) {
  const rng = mulberry32(cyrb53(code) >>> 0);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const k = Math.floor(rng() * 256);
    out += String.fromCharCode((text.charCodeAt(i) & 0xff) ^ k);
  }
  return out;
}

/** Encrypt a link (ASCII path) under a code. Returns a base64 blob. */
export function enc(link, code) {
  const bin = xorText(MAGIC + link, code);
  return Buffer.from(bin, "latin1").toString("base64");
}

/** Decrypt a blob under a code. Returns the link, or null if the code is wrong. */
export function dec(blob, code) {
  let bin;
  try { bin = Buffer.from(String(blob), "base64").toString("latin1"); } catch { return null; }
  const out = xorText(bin, code);
  return out.startsWith(MAGIC) ? out.slice(MAGIC.length) : null;
}
