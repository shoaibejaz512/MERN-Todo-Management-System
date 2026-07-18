import { RateLimiterMemory } from "rate-limiter-flexible";

const aiLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 300, // block for 5 minutes
});

export default aiLimiter;
