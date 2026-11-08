import client from "prom-client";

export const registry = new client.Registry();

client.collectDefaultMetrics({
  register: registry,
  prefix: "flowdo_",
});

export const httpRequests = new client.Counter({
  name: "flowdo_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: "flowdo_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});




// Expose metrics
export const getMetrics = async () => {
  return {
    contentType: registry.contentType,
    metrics: await registry.metrics(),
  };
};

export { registry };