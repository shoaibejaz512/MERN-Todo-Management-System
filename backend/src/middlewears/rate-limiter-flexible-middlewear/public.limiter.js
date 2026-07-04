import { RateLimiterMemory } from "rate-limiter-flexible";

const publicLimiter = new RateLimiterMemory({
  points: 300,
  duration: 60,
});

export default publicLimiter;
