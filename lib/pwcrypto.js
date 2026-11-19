// Aus EINEM Passwort entstehen im Browser zwei getrennte Werte (PBKDF2-SHA256, 600 000 Runden):
//  - der Login-Wert: geht an den Server (der speichert davon wie bisher nur einen Hash)
//  - der Wallet-Schlüssel: bleibt im Browser und entschlüsselt den Wallet-Tresor
// Das echte Passwort verlässt das Gerät nie. Aus dem Login-Wert lässt sich der Wallet-Schlüssel nicht berechnen.
export const ITER = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (u8) => btoa(String.fromCharCode(...u8));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
const salted = (authSalt, label) => { const a = unb64(authSalt), b = enc.encode(label), o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const base = (pw) => crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits', 'deriveKey']);

export async function loginToken(pw, authSalt) {
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salted(authSalt, 'pepe.coffee/login/v1'), iterations: ITER }, await base(pw), 256);
  return b64(new Uint8Array(bits));
}
export async function walletKey(pw, authSalt) {
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salted(authSalt, 'pepe.coffee/wallet/v1'), iterations: ITER }, await base(pw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// Tresor Version 2: AES-GCM mit dem Wallet-Schlüssel, ohne eigenes Passwort
export async function lockVault2(wif, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(wif)));
  return { v: 2, kdf: 'PBKDF2-SHA256-ACCOUNT', iter: ITER, iv: b64(iv), ct: b64(ct) };
}
export async function openVault2(vault, key) {
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct)));
}
export const MIN_PW = 10;
