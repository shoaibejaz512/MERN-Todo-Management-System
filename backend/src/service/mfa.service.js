import mongoose from "mongoose";
import User from "../models/user.model.js";

import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateQrCode,
  verifyTotp,
} from "./totp.service.js";

import {
  generateRecoveryCodes,
  consumeRecoveryCode,
} from "./recovery-code.service.js";

function invalidVerification() {
  const error = new Error("Invalid or expired verification");
  error.statusCode = 400;
  return error;
}

function unauthorized() {
  const error = new Error("Authentication required");
  error.statusCode = 401;
  return error;
}

function conflict() {
  const error = new Error("MFA state has changed; try again");
  error.statusCode = 409;
  return error;
}

function validateUserId(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw unauthorized();
  }
}

function validTimeStep(step) {
  return Number.isSafeInteger(step) && step >= 0;
}

/**
 * Begin enrollment. MFA remains disabled until confirmSetup succeeds.
 * Pending setup state must also have an expiry in the User schema.
 */
export async function beginSetup(userId) {
  validateUserId(userId);

  const secret = generateTotpSecret();

  const pendingExpiry = new Date(Date.now() + 5 * 60 * 1000);

  const result = await User.updateOne(
    {
      _id: userId,
      "mfa.twoFactorEnabled": { $ne: true },
    },
    {
      $set: {
        "mfa.pendingSecretEncrypted": encryptSecret(secret.base32),
        "mfa.pendingExpiresAt": pendingExpiry,
      },
    }
  );

  if (result.matchedCount !== 1) {
    throw conflict();
  }

  const qrCode = await generateQrCode(secret.otpauth_url);

  return {
    qrCode,
    expiresAt: pendingExpiry,
  };
}

/**
 * Verify initial enrollment and atomically enable MFA.
 * Recovery codes are returned once, and never stored as plaintext.
 */
export async function confirmSetup(userId, code) {
  validateUserId(userId);

  const user = await User.findOne({
    _id: userId,
    "mfa.twoFactorEnabled": { $ne: true },
    "mfa.pendingExpiresAt": { $gt: new Date() },
  }).select("+mfa.pendingSecretEncrypted +mfa.lastTotpStep");

  if (!user?.mfa?.pendingSecretEncrypted) {
    throw invalidVerification();
  }

  const secret = decryptSecret(user.mfa.pendingSecretEncrypted);
  const acceptedStep = verifyTotp({ secret, code });

  if (!validTimeStep(acceptedStep)) {
    throw invalidVerification();
  }

  const { codes, hashes } = generateRecoveryCodes();

  const result = await User.updateOne(
    {
      _id: userId,
      "mfa.twoFactorEnabled": { $ne: true },
      "mfa.pendingExpiresAt": { $gt: new Date() },
      "mfa.pendingSecretEncrypted": user.mfa.pendingSecretEncrypted,
      $or: [
        { "mfa.lastTotpStep": { $exists: false } },
        { "mfa.lastTotpStep": { $lt: acceptedStep } },
      ],
    },
    {
      $set: {
        "mfa.twoFactorEnabled": true,
        "mfa.secretEncrypted": user.mfa.pendingSecretEncrypted,
        "mfa.enabledAt": new Date(),
        "mfa.lastTotpStep": acceptedStep,
        "mfa.recoveryCodeHashes": hashes,
      },
      $unset: {
        "mfa.pendingSecretEncrypted": 1,
        "mfa.pendingExpiresAt": 1,
      },
    }
  );

  if (result.modifiedCount !== 1) {
    throw conflict();
  }

  return {
    enabled: true,
    recoveryCodes: codes,
  };
}

/**
 * Verify a TOTP code for an already authenticated user.
 * This is NOT the pre-session login challenge endpoint.
 */
export async function verifyForSensitiveAction(userId, code) {
  validateUserId(userId);

  const user = await User.findOne({
    _id: userId,
    "mfa.twoFactorEnabled": true,
  }).select("+mfa.secretEncrypted +mfa.lastTotpStep");

  if (!user?.mfa?.secretEncrypted) {
    throw invalidVerification();
  }

  const secret = decryptSecret(user.mfa.secretEncrypted);
  const acceptedStep = verifyTotp({ secret, code });

  if (!validTimeStep(acceptedStep)) {
    throw invalidVerification();
  }

  const result = await User.updateOne(
    {
      _id: userId,
      "mfa.twoFactorEnabled": true,
      "mfa.secretEncrypted": user.mfa.secretEncrypted,
      $or: [
        { "mfa.lastTotpStep": { $exists: false } },
        { "mfa.lastTotpStep": { $lt: acceptedStep } },
      ],
    },
    {
      $set: {
        "mfa.lastTotpStep": acceptedStep,
      },
    }
  );

  if (result.modifiedCount !== 1) {
    throw invalidVerification();
  }

  return { verified: true };
}

export async function verifyRecoveryCode(userId, code) {
  validateUserId(userId);

  const consumed = await consumeRecoveryCode(User, userId, code);

  if (!consumed) {
    throw invalidVerification();
  }

  return { verified: true, method: "recovery_code" };
}

/**
 * Disable MFA only after the controller has required recent authentication
 * and this function has verified the submitted TOTP.
 */
export async function disableMfa(userId, code) {
  validateUserId(userId);

  const user = await User.findOne({
    _id: userId,
    "mfa.twoFactorEnabled": true,
  }).select("+mfa.secretEncrypted +mfa.lastTotpStep");

  if (!user?.mfa?.secretEncrypted) {
    throw invalidVerification();
  }

  const secret = decryptSecret(user.mfa.secretEncrypted);
  const acceptedStep = verifyTotp({ secret, code });

  if (!validTimeStep(acceptedStep)) {
    throw invalidVerification();
  }

  const result = await User.updateOne(
    {
      _id: userId,
      "mfa.twoFactorEnabled": true,
      "mfa.secretEncrypted": user.mfa.secretEncrypted,
      $or: [
        { "mfa.lastTotpStep": { $exists: false } },
        { "mfa.lastTotpStep": { $lt: acceptedStep } },
      ],
    },
    {
      $set: {
        "mfa.twoFactorEnabled": false,
      },
      $unset: {
        "mfa.secretEncrypted": 1,
        "mfa.pendingSecretEncrypted": 1,
        "mfa.pendingExpiresAt": 1,
        "mfa.enabledAt": 1,
        "mfa.lastTotpStep": 1,
        "mfa.recoveryCodeHashes": 1,
      },
    }
  );

  if (result.modifiedCount !== 1) {
    throw invalidVerification();
  }

  return { enabled: false };
}

export async function regenerateRecoveryCodes(userId, code) {
  validateUserId(userId);

  // Verify and consume a fresh TOTP code before rotating recovery codes.
  await verifyForSensitiveAction(userId, code);

  const { codes, hashes } = generateRecoveryCodes();

  const result = await User.updateOne(
    {
      _id: userId,
      "mfa.twoFactorEnabled": true,
    },
    {
      $set: {
        "mfa.recoveryCodeHashes": hashes,
      },
    }
  );

  if (result.modifiedCount !== 1) {
    throw conflict();
  }

  return { recoveryCodes: codes };
}
