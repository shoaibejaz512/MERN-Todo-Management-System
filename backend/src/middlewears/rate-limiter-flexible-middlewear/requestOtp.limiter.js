import { RateLimiterMemory } from "rate-limiter-flexible";

const OTPLimter = new RateLimiterMemory({
  points: 3,
  duration: 60,
  blockDuration: 300,
});

export default OTPLimter;
