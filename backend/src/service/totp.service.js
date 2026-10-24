import crypto from "node:crypto";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

const ISSUER = process.env.MFA_ISSUER || "FlowDo";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const TOTP_STEP_SECONDS = 30;

function getEncryptionKey() {
  const encodedKey = process.env.MFA_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("MFA_ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key"
    );
  }

  return key;
}

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    iv
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(encryptedValue) {
  const [version, ivValue, tagValue, ciphertextValue] =
    encryptedValue?.split(".") ?? [];

  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted MFA secret format");
  }

  const iv = Buffer.from(ivValue, "base64");
  const authTag = Buffer.from(tagValue, "base64");
  const ciphertext = Buffer.from(ciphertextValue, "base64");

  if (iv.length !== 12 || authTag.length !== 16 || !ciphertext.length) {
    throw new Error("Invalid encrypted MFA secret");
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    iv
  );

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret() {
  return speakeasy.generateSecret({
    name: ISSUER,
    issuer: ISSUER,
    length: 32,
  });
}

export async function generateQrCode(otpauthUrl) {
  if (!otpauthUrl?.startsWith("otpauth://totp/")) {
    throw new Error("Invalid TOTP provisioning URI");
  }

  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
  });
}

/**
 * Returns the matched TOTP time-step, or null.
 * The caller must atomically record the accepted step to
 * prevent concurrent requests from reusing the same code.
 */
export function verifyTotp({ secret, code, window = 1 }) {
  if (
    typeof code !== "string" ||
    !/^\d{6}$/.test(code) ||
    typeof secret !== "string" ||
    !Number.isInteger(window) ||
    window < 0 ||
    window > 1
  ) {
    return null;
  }

  const delta = speakeasy.totp.verifyDelta({
    secret,
    encoding: "base32",
    token: code,
    step: TOTP_STEP_SECONDS,
    window,
  });

  if (!delta || !Number.isInteger(delta.delta)) {
    return null;
  }

  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + delta.delta;
}
