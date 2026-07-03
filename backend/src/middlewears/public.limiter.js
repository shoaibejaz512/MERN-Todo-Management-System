import { RateLimiterMemory } from "rate-limiter-flexible";

const publicLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

export default publicLimiter;
