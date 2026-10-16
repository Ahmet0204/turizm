/* turizm — şifre özeti ve imzalı oturum çerezi (WebCrypto) */

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100000; // Workers'ın izin verdiği üst sınır

export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export const b64url = {
  encode(buf) {
    let s = '';
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }
};

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Şifre ─────────────────────────────────────
export async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPassword(password, hashHex, saltHex) {
  const { hash } = await hashPassword(password, saltHex);
  return safeEqual(hash, hashHex);
}

// ── Oturum ────────────────────────────────────
async function sign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64url.encode(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// Şifre değişince eski oturumlar geçersiz olsun diye özetin başı da imzalanır
export async function createSession(secret, admin) {
  const payload = b64url.encode(enc.encode(JSON.stringify({
    id: admin.id,
    v: admin.pass_hash.slice(0, 12),
    exp: Date.now() + SESSION_SECONDS * 1000
  })));
  return `${payload}.${await sign(secret, payload)}`;
}

export async function readSession(secret, token) {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await sign(secret, payload))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64url.decode(payload)));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
