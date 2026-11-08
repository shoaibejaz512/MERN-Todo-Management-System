import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",

    // Production mein 100% traces collect karna zaroori nahi.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Request bodies aur sensitive headers ko automatically
    // send karne ki permission mat do.
    sendDefaultPii: false,
  });
}

export default Sentry;
