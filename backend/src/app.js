import express from "express";
import * as Sentry from "@sentry/node";
import { metricsMiddleware } from "./middlewares/metrics.middleware.js";
import cors from "cors";
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
app.use(metricsMiddleware);
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
app.use((req, res, next) => {
  res.setHeader("X-Request-ID", req.id);
  next();
});

Sentry.setupExpressErrorHandler(app);


//routes import
import userRoute from "./routes/user.routes.js";
import singleTodoRoutes from "./routes/todo.routes.js"
import groupTodoRoutes from "./routes/group-todo.routes.js"
import SubTodoRoutes from "./routes/sub-todo.routes.js";
import healthRoutes from "./routes/health.routes.js";
import metricsRoutes from "./routes/metrics.routes.js";


app.use("/api/v1/users", userRoute);
app.use('/api/v1/single-todos',singleTodoRoutes)
app.use("/api/v1/group-todos", groupTodoRoutes);
app.use("/api/v1/sub-tasks",SubTodoRoutes);
app.use("/health", healthRoutes);
app.use("/metrics", metricsRoutes);
