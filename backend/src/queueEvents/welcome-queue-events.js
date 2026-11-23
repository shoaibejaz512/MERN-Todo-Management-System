import { QueueEvents } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { WELCOME_QUEUE_NAME } from "../queues/welcome-email.queue.js";

const welcomeEmailEvents = new QueueEvents(WELCOME_QUEUE_NAME, {
  connection: redisConnection,
});

welcomeEmailEvents.on("waiting", ({ jobId }) => {
  console.log(`[WELCOME EMAIL] Job ${jobId} is waiting`);
});

welcomeEmailEvents.on("active", ({ jobId }) => {
  console.log(`[WELCOME EMAIL] Job ${jobId} started`);
});

welcomeEmailEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`[WELCOME EMAIL] Job ${jobId} completed`, returnvalue);
});

welcomeEmailEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`[WELCOME EMAIL] Job ${jobId} failed: ${failedReason}`);
});

welcomeEmailEvents.on("error", (error) => {
  console.error("[WELCOME EMAIL QUEUE ERROR]", error);
});

export default welcomeEmailEvents;
