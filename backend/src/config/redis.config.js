import Redis from "ioredis";
import { green, greenBright, red, yellowBright } from "colorette";

const redisClient = new Redis(process.env.REDIS_URL);

redisClient.on("error", (error) => {
  console.error(red(`Redis Client Error: ${error.message}`));
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

export default redisClient;
