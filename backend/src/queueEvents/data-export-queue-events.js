import { QueueEvents } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { EXPORT_QUEUE_NAME } from "../queues/Exportqueue.js";

const delayQueueEvents = new QueueEvents(EXPORT_QUEUE_NAME, {
  connection: redisConnection,
});

delayQueueEvents.on("waiting", ({ jobId }) => {
  console.log(`[DELAY QUEUE] Job ${jobId} is waiting`);
});

delayQueueEvents.on("active", ({ jobId }) => {
  console.log(`[DELAY QUEUE] Job ${jobId} started`);
});

delayQueueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`[DELAY QUEUE] Job ${jobId} completed`, returnvalue);
});

delayQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`[DELAY QUEUE] Job ${jobId} failed: ${failedReason}`);
});

delayQueueEvents.on("error", (error) => {
  console.error("[DELAY QUEUE ERROR]", error);
});

export default delayQueueEvents;
