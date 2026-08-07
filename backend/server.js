import "dotenv/config";

import http from "http";
import { Server } from "socket.io";
import { greenBright, redBright } from "colorette";

import { app } from "./src/app.js";
import { connect_db } from "./src/db/connectDb.js";
import { connectRedis } from "./config/redis.js";
import { initializeSocket } from "./src/socket/socket.js";

const PORT = process.env.PORT || 8000;

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: process.env.CURRENT_URL,
    credentials: true,
  },
});

const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connect_db();

    // 2. Connect Redis
    await connectRedis();

    // 3. Initialize Socket.io
    initializeSocket(io);

    // 4. Start HTTP server
    server.listen(PORT, () => {
      console.log(greenBright(`🚀 Server running on port ${PORT}`));
    });
  } catch (error) {
    console.error(redBright("❌ Server startup failed:"), error);

    process.exit(1);
  }
};

startServer();
