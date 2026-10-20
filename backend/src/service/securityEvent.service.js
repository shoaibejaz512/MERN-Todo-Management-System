import SecurityEvent from "../models/securityEvent.model.js";

export const logSecurityEvent = async ({
  userId = null,
  eventType,
  source,
  outcome,
  severity = "LOW",
  sessionId = null,
  ipAddress = null,
  userAgent = null,
  requestId = null,
  metadata = {},
}) => {
  return SecurityEvent.create({
    userId,
    eventType,
    source,
    outcome,
    severity,
    sessionId,
    ipAddress,
    userAgent,
    requestId,
    metadata,
  });
};
