import { RateLimiterMemory } from "rate-limiter-flexible";

const registerLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 600,
});

export default registerLimiter;
