import redisClient from "../config/redis.config.js";

export const getCache = async (key) => { // getCache function retrieves the cached data from Redis using the provided key. It returns null if the data is not found, otherwise it parses and returns the JSON data.
  const data = await redisClient.get(key);

  if (!data) {
    return null;
  }

  return JSON.parse(data);
};

export const setCache = async (key, data, ttl = 60) => { // setCache function stores the provided data in Redis with the specified key and time-to-live (ttl) in seconds. It serializes the data to JSON format before storing it.
  await redisClient.set(key, JSON.stringify(data), "EX", ttl);
};

export const deleteCache = async (key) => { // deleteCache function removes the cached data from Redis using the provided key. It does nothing if the key is not found.
  await redisClient.del(key);
};

export const deleteManyCache = async (keys) => { // deleteManyCache function removes multiple cached data entries from Redis using the provided array of keys. It does nothing if the array is empty.
  if (!keys.length) {
    return;
  }

  await redisClient.del(...keys);
};
