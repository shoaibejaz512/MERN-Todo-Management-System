import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { apiLimiter } from "./middlewears/rate-limiter-flexible-middlewear/apiLimiter.js";
import compression from "compression";
import morgan from "morgan";
import requestId from "express-request-id";
import httpLogger from "./loggers/httpLogger.js";
import swaggerUI from "swagger-ui-express";
import swaggerDocument from "./service/swagger-output.json" with {type:"json"};

export const app = express();
app.use(express.json({ extended: true, limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(compression());
app.use(httpLogger);
app.use(morgan("dev"));
app.use(apiLimiter);
app.use(requestId());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CURRENT_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 3600, //reduce preflight requirests
  })
);
app.use(helmet());
if (process.env.NODE_ENV !== "production") {
  app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerDocument));
}

//routes import
import userRoute from "./routes/user.routes.js";
import singleTodoRoutes from "./routes/todo.routes.js"

app.use("/api/v1/users", userRoute);
app.use('/api/v1/todos',singleTodoRoutes)