import * as mfaService from "../service/mfa.service.js";

function getUserId(req) {
  const userId = req.user?.userId;

  if (!userId) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  return userId;
}

export async function beginMfaSetup(req, res, next) {
  try {
    const result = await mfaService.beginSetup(getUserId(req));

    return res.status(200).json({
      success: true,
      message: "MFA setup initialized",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function confirmMfaSetup(req, res, next) {
  try {
    const result = await mfaService.confirmSetup(getUserId(req), req.body.code);

    return res.status(200).json({
      success: true,
      message: "MFA enabled successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function verifyMfaCode(req, res, next) {
  try {
    const result = await mfaService.verifyForSensitiveAction(
      getUserId(req),
      req.body.code
    );

    return res.status(200).json({
      success: true,
      message: "MFA verification successful",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function verifyRecoveryCode(req, res, next) {
  try {
    const result = await mfaService.verifyRecoveryCode(
      getUserId(req),
      req.body.code
    );

    return res.status(200).json({
      success: true,
      message: "Recovery code accepted",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function disableMfa(req, res, next) {
  try {
    const result = await mfaService.disableMfa(getUserId(req), req.body.code);

    return res.status(200).json({
      success: true,
      message: "MFA disabled successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function regenerateRecoveryCodes(req, res, next) {
  try {
    const result = await mfaService.regenerateRecoveryCodes(
      getUserId(req),
      req.body.code
    );

    return res.status(200).json({
      success: true,
      message: "Recovery codes regenerated",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
