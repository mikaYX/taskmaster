const crypto = require("crypto");

// -------------------- Auth (HMAC signed token) --------------------
const AUTH_SECRET = process.env.AUTH_SECRET || "CHANGE_ME_AUTH_SECRET";
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

function b64urlEncode(buf) {
    return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return Buffer.from(str, "base64");
}

function signToken(payload) {
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + TOKEN_TTL_SEC };
    const bodyB64 = b64urlEncode(JSON.stringify(body));
    const sig = crypto.createHmac("sha256", AUTH_SECRET).update(bodyB64).digest();
    const sigB64 = b64urlEncode(sig);
    return `${bodyB64}.${sigB64}`;
}

function verifyToken(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [bodyB64, sigB64] = parts;

    const expected = crypto.createHmac("sha256", AUTH_SECRET).update(bodyB64).digest();
    const got = b64urlDecode(sigB64);
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;

    let body;
    try { body = JSON.parse(b64urlDecode(bodyB64).toString("utf8")); }
    catch { return null; }

    const now = Math.floor(Date.now() / 1000);
    if (!body.exp || now > body.exp) return null;

    return body;
}

function safeFilename(original) {
    const path = require("path");
    const ext = path.extname(original || "").toLowerCase();
    const base = crypto.randomBytes(12).toString("hex");
    return base + (ext || "");
}

// -------------------- Password hashing --------------------
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const iter = 120000;
    const keylen = 32;
    const digest = "sha256";
    const dk = crypto.pbkdf2Sync(password, salt, iter, keylen, digest);
    return `pbkdf2:${digest}:${iter}:${b64urlEncode(salt)}:${b64urlEncode(dk)}`;
}

function verifyPassword(password, stored) {
    if (!stored || typeof stored !== "string") return false;
    const parts = stored.split(":");
    if (parts.length !== 5) return false;
    const [, digest, iterStr, saltB64, dkB64] = parts;
    const iter = parseInt(iterStr, 10);
    if (!iter || !digest) return false;
    const salt = b64urlDecode(saltB64);
    const dk = b64urlDecode(dkB64);
    const test = crypto.pbkdf2Sync(password, salt, iter, dk.length, digest);
    return test.length === dk.length && crypto.timingSafeEqual(test, dk);
}

// -------------------- Encryption (AES-256-CBC) --------------------
const ENCRYPTION_KEY = crypto.scryptSync(AUTH_SECRET, 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = {
    signToken,
    verifyToken,
    hashPassword,
    verifyPassword,
    safeFilename,
    encrypt,
    decrypt
};
