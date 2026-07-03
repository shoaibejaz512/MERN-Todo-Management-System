import { RateLimiterMemory } from "rate-limiter-flexible";

const registerLimiter = new RateLimiterMemory({
  points: 3,
  duration: 300,
  blockDuration: 600,
});

export default registerLimiter;
