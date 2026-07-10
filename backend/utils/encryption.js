const crypto = require('crypto');

// ENCRYPTION_KEY must be a 64-char hex string (32 bytes) in production.
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const RAW_KEY = process.env.ENCRYPTION_KEY;

let KEY;
if (RAW_KEY && RAW_KEY.length >= 64) {
  KEY = Buffer.from(RAW_KEY.slice(0, 64), 'hex');
} else {
  // Development fallback — do NOT use in production
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL: ENCRYPTION_KEY env variable is missing. Set a 64-char hex string.');
  } else {
    console.warn('⚠️  ENCRYPTION_KEY not set — using deterministic dev fallback. Set it in .env for production.');
  }
  KEY = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns { iv, encrypted, tag } — all hex-encoded strings.
 */
exports.encrypt = (text) => {
  if (text === null || text === undefined || text === '') return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(text), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    encrypted: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  };
};

/**
 * Decrypt an encrypted object { iv, encrypted, tag } back to plaintext.
 * Returns null on failure so callers can handle gracefully.
 */
exports.decrypt = (data) => {
  if (!data || !data.iv || !data.encrypted || !data.tag) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      KEY,
      Buffer.from(data.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data.encrypted, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Mask a secret for safe display.
 * Short values become "••••••••". Others show last 4 chars.
 */
exports.maskSecret = (value) => {
  if (!value) return '••••••••••••••••';
  const str = String(value);
  if (str.length <= 8) return '••••••••';
  return '•'.repeat(12) + str.slice(-4);
};

/**
 * Encrypt a flat object's sensitive fields in-place.
 * Pass fieldsToEncrypt as array of key names.
 * Returns a new object with those fields encrypted.
 */
exports.encryptFields = (obj, fieldsToEncrypt) => {
  if (!obj) return obj;
  const result = { ...obj };
  for (const key of fieldsToEncrypt) {
    if (result[key] !== undefined && result[key] !== null && result[key] !== '') {
      result[key] = exports.encrypt(result[key]);
    }
  }
  return result;
};

/**
 * Decrypt a flat object's encrypted fields in-place.
 * Returns a new object with those fields decrypted.
 */
exports.decryptFields = (obj, fieldsToDecrypt) => {
  if (!obj) return obj;
  const result = { ...obj };
  for (const key of fieldsToDecrypt) {
    if (result[key] && typeof result[key] === 'object' && result[key].iv) {
      result[key] = exports.decrypt(result[key]);
    }
  }
  return result;
};

/**
 * Mask all sensitive fields in an object for client response.
 * Replaces encrypted objects or plaintext secrets with masked strings.
 */
exports.maskFields = (obj, fieldsToMask) => {
  if (!obj) return obj;
  const result = { ...obj };
  for (const key of fieldsToMask) {
    if (result[key]) {
      // If it's an encrypted object, just show mask
      if (typeof result[key] === 'object' && result[key].iv) {
        result[key] = exports.maskSecret('•••');
      } else {
        result[key] = exports.maskSecret(result[key]);
      }
    }
  }
  return result;
};
