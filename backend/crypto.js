const crypto = require('crypto');

// AES-256-GCM at the application layer — protects translation text against
// anyone with raw DB access (a leaked SUPABASE_SERVICE_KEY, a DB dump, etc.),
// which disk-level encryption-at-rest (already provided by Supabase/Postgres)
// does not. TRANSLATIONS_ENC_KEY is a 32-byte key, hex-encoded (64 hex chars)
// in .env — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const KEY = process.env.TRANSLATIONS_ENC_KEY
  ? Buffer.from(process.env.TRANSLATIONS_ENC_KEY, 'hex')
  : null;

const ALGO    = 'aes-256-gcm';
const IV_LEN  = 12; // recommended nonce size for GCM
const TAG_LEN = 16;

// Packs iv + auth tag + ciphertext into one base64 string so the existing
// `text` columns need no schema change.
function encryptText(plaintext) {
  if (!KEY) throw new Error('TRANSLATIONS_ENC_KEY не настроен');
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptText(encoded) {
  if (!KEY) throw new Error('TRANSLATIONS_ENC_KEY не настроен');
  const buf        = Buffer.from(encoded, 'base64');
  const iv         = buf.subarray(0, IV_LEN);
  const tag        = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encryptText, decryptText };
