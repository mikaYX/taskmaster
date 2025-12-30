const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Encrypts a buffer or string.
 * Returns a JSON string containing the encrypted data and metadata.
 */
function encrypt(data, password) {
    if (!Buffer.isBuffer(data)) {
        data = Buffer.from(data);
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey(password, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    return JSON.stringify({
        v: 1, // version
        alg: ALGORITHM,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex')
    });
}

/**
 * Decrypts an encrypted JSON string (or object).
 * Returns the decrypted Buffer.
 */
function decrypt(encryptedData, password) {
    let parsed;
    try {
        parsed = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;
    } catch (e) {
        throw new Error('Invalid encrypted format');
    }

    if (!parsed.salt || !parsed.iv || !parsed.tag || !parsed.data) {
        throw new Error('Invalid encrypted data structure');
    }

    const salt = Buffer.from(parsed.salt, 'hex');
    const iv = Buffer.from(parsed.iv, 'hex');
    const tag = Buffer.from(parsed.tag, 'hex');
    const data = Buffer.from(parsed.data, 'hex');

    const key = getKey(password, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Checks if the given data looks like our encrypted format
 */
function isEncrypted(data) {
    try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return parsed.v === 1 && parsed.alg === ALGORITHM && !!parsed.salt && !!parsed.iv && !!parsed.data;
    } catch (e) {
        return false;
    }
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted
};
