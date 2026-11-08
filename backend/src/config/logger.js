import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),

  redact: {
    paths: [
      "password",
      "body.password",
      "body.confirmPassword",
      "body.otp",
      "body.token",
      "body.accessToken",
      "body.refreshToken",
      "body.mfaSecret",
      "body.recoveryCode",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.otp",
      "req.body.token",
      "req.body.refreshToken",
    ],
    censor: "[REDACTED]",
  },

  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
});

export default logger;
