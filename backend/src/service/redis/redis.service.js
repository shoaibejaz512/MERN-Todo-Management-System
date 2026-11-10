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




// Store only if the key does not already exist.
export const setCacheIfNotExists = async (key, value, ttl) => {
  const result = await redisClient.set(key, value, "EX", ttl, "NX");

  return result === "OK";
};

// Delete only if the stored value matches.
// Prevents deleting another request's newly generated OTP.
export const deleteCacheIfValueMatches = async (key, expectedValue) => {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end

    return 0
  `;

  return redisClient.eval(script, 1, key, expectedValue);
};

