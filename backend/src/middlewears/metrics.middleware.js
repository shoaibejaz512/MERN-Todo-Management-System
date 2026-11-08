import { httpRequests, httpDuration } from "../config/metrics.js";

export function metricsMiddleware(req, res, next) {
  // Metrics scrape ko application request count mein include na karo.
  if (req.path === "/metrics") {
    return next();
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    // Raw URLs use nahi karne: IDs aur arbitrary paths se
    // metric cardinality bohat barh sakti hai.
    const route = req.route
      ? `${req.baseUrl || ""}${req.route.path}`
      : "unmatched";

    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequests.inc(labels);

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    httpDuration.observe(labels, durationSeconds);
  });

  next();
}
