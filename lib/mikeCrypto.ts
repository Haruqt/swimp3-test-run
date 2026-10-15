import crypto from "crypto";

// Matches the MIKE IronPython script's encryption exactly:
//   key = SHA256(password) (32 bytes) · AES-256-CBC · PKCS7 padding ·
//   random 16-byte IV PREPENDED to the ciphertext · whole thing base64.
export function mikeEncrypt(plain: string, password: string): string {
  const key = crypto.createHash("sha256").update(password, "utf8").digest();
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([iv, c.update(plain, "utf8"), c.final()]).toString("base64");
}

export function mikeDecrypt(b64: string, password: string): string {
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 32 || (raw.length - 16) % 16 !== 0) throw new Error("Ciphertext has an invalid length");
  const key = crypto.createHash("sha256").update(password, "utf8").digest();
  const d = crypto.createDecipheriv("aes-256-cbc", key, raw.subarray(0, 16));
  return Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString("utf8");
}