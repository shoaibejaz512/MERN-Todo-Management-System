import { Queue } from "bullmq";
import IORedis from "ioredis";

export const EXPORT_QUEUE_NAME = "data-export";

// BullMQ requires maxRetriesPerRequest: null on its connection.
export const exportConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const exportQueue = new Queue(EXPORT_QUEUE_NAME, {
  connection: exportConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
