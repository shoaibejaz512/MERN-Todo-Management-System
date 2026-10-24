import mongoose from "mongoose";

function validationError() {
  const error = new Error("Invalid request data");
  error.statusCode = 400;
  return error;
}

function validateBody(fields) {
  return function mfaValidationMiddleware(req, res, next) {
    try {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        throw validationError();
      }

      const allowed = new Set(fields);

      // Reject unexpected properties rather than silently accepting them.
      for (const key of Object.keys(req.body)) {
        if (!allowed.has(key)) {
          throw validationError();
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const validateSetup = validateBody([]);

export const validateTotpCode = validateBody(["code"]);

export const validateDisableMfa = validateBody(["code"]);

export const validateRecoveryCode = validateBody(["code"]);

export const validateRegenerateRecoveryCodes = validateBody(["code"]);

export const validateLoginChallenge = validateBody(["challengeId", "code"]);

export function validateTotpBody(req, res, next) {
  try {
    const { code } = req.body ?? {};

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      throw validationError();
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function validateChallengeBody(req, res, next) {
  try {
    const { challengeId, code } = req.body ?? {};

    if (
      typeof challengeId !== "string" ||
      !mongoose.isValidObjectId(challengeId) ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    ) {
      throw validationError();
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function validateRecoveryCodeBody(req, res, next) {
  try {
    const { code } = req.body ?? {};

    if (
      typeof code !== "string" ||
      !/^([A-F0-9]{4}-){3}[A-F0-9]{4}$/i.test(code.trim())
    ) {
      throw validationError();
    }

    next();
  } catch (error) {
    next(error);
  }
}
