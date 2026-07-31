import "dotenv/config"; // yeh sab se pehli line honi chahiye
import { green, greenBright, red, redBright } from "colorette";
import { app } from "./src/app.js";
import { connect_db } from "./src/db/connectDb.js";
// import { initializeSocket } from "./socket/socket.js";
import http from "http";
import { Server } from "socket.io";
import { initializeSocket } from "./src/socket/socket.js";

const PORT = process.env.PORT || 8000;
connect_db().catch((err) => {
  console.error(redBright("❌ Mongo_db connection failed!!!", err));
  process.exit(1);
});

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: process.env.CURRENT_URL,
    credentials: true,
  },
});

initializeSocket(io);
server.listen(PORT, () => {
  console.log(greenBright(`Server running on port ${PORT}`));
});
