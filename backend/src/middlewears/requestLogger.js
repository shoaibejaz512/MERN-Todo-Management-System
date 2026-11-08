import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import logger from "../config/logger.js";

const requestLogger = pinoHttp({
  logger,

  // Har incoming request ko server-generated ID milegi.
  genReqId: () => randomUUID(),

  customProps(req) {
    return {
      requestId: req.id,
    };
  },

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  // URL mein query parameters ya sensitive values log na hon.
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "responseTimeMs",
  },

  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url?.split("?")[0],
      };
    },

    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

export default requestLogger;
