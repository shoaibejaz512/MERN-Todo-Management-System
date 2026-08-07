import { green, greenBright, red, yellowBright } from "colorette";
import { createClient } from "ioredis";

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (error) => {
  console.error(red(`Redis Client Error:, ${error}`));
});

redisClient.on("connect", () => {
  console.log(green("Redis connecting..."));
});

redisClient.on("ready", () => {
  console.log(greenBright("Redis ready"));
});

redisClient.on("reconnecting", () => {
  console.log(yellowBright("Redis reconnecting..."));
});

export const connectRedis = async () => {
  if (redisClient.isOpen) {
    return;
  }

  await redisClient.connect();
};

export default redisClient;
