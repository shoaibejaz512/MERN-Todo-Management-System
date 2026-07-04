import { RateLimiterMemory } from "rate-limiter-flexible";

export const apiRateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});
