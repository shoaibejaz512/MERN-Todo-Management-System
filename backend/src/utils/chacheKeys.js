export const soloTaskKey = (taskId) => `solo:task:${taskId}`;

export const soloProgressKey = (taskId) => `solo:progress:${taskId}`;

export const subTaskKey = (subTaskId) => `subtask:${subTaskId}`;

export const subTaskProgressKey = (taskId) => `subtask:progress:${taskId}`;

export const subTaskStatsKey = (taskId) => `subtask:stats:${taskId}`;

export const groupTaskKey = (taskId) => `group:task:${taskId}`;

export const groupProgressKey = (taskId) => `group:progress:${taskId}`;

export const groupHistoryKey = (taskId) => `group:history:${taskId}`;

export const userKey = (userId) => `user:profile:${userId}`;

export const usersKey = (page, limit, search) =>
  `users:profile:${page}:${limit}:${search}`;

export const emailVerificationOtpKey = (email) => `email:otp:${email}`;

export const passwordResetOtpKey = (email) => `password:otp:${email}`;

export const updateEmailOtp = (id) => `email:update:${id}`

export const userStatsKey = (userId) => `user:stats:${userId}`;

export const userActivityKey = (userId,page,limit,type) =>
  `user:activity:${userId}:` +
  `page:${page}:` +
  `limit:${limit}:` +
  `type:${type}`;