import { RateLimiterMemory } from "rate-limiter-flexible";

export const apiRateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
  blockDuration:300,//block for 5 minutes
});
