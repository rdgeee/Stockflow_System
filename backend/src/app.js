import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import api from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
if (env.nodeEnv !== "test") app.use(morgan("dev"));

app.use("/api", api);
app.use(notFound);
app.use(errorHandler);

export default app;
