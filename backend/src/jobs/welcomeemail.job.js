import { Worker } from "bullmq";
import IORedis from "ioredis";
import { green, red } from "colorette";

import { WELCOME_QUEUE_NAME } from "../queues/welcome-email.queue.js";
import { sendWelcomeEmail } from "../service/nodemailers/emailService.js";

const connection = new IORedis({
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  WELCOME_QUEUE_NAME,
  async (job) => {
    const user = job.data;

    console.log(`Processing welcome email for ${user.email}`);

    await sendWelcomeEmail(user);

    return {
      success: true,
      email: user.email,
    };
  },
  {
    connection,
    concurrency: 5,
  }
);

// Job completed
worker.on("completed", (job, result) => {
  console.log(green(`[EMAIL] Job ${job.id} completed successfully`));
});

// Job failed
worker.on("failed", (job, error) => {
  console.log(red(`[EMAIL] Job ${job?.id} failed: ${error.message}`));
});

// Worker errors
worker.on("error", (error) => {
  console.error(red(`[WORKER ERROR] ${error.message}`));
});

export default worker;
