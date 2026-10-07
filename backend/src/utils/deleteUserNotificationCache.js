const deleteUserNotificationCache = async (userId) => {
  const pattern = `notifications:${userId}:*`;

  const keys = [];

  let cursor = "0";

  do {
    const [nextCursor, matchedKeys] = await redisClient.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100
    );

    cursor = nextCursor;

    keys.push(...matchedKeys);
  } while (cursor !== "0");

  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
};
