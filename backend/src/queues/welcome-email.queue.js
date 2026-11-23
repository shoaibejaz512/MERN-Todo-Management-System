import {Queue} from "bullmq"

export const WELCOME_QUEUE_NAME = "welcome_email_user";


// BullMQ requires maxRetriesPerRequest: null on its connection.
export const exportConnection_welcome = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const welcome_email_queue = new Queue(WELCOME_QUEUE_NAME,{
    connection:exportConnection_welcome,
});
