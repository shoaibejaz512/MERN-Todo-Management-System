import { RateLimiterMemory } from "rate-limiter-flexible";

const loginLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
  blockDuration: 300,
});

export default loginLimiter;
