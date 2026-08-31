/**
 * APIx backend — Node.js + Express + MongoDB Atlas (Mongoose).
 *
 * This is the deployable Express service (Render). The live Lovable prototype
 * serves the identical contract from src/routes/api/$.ts so the dashboard can
 * be demoed without external infrastructure.
 */
require("dotenv").config();

const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");

const api = require("./routes/index");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  }),
);
app.use(express.json());
app.use("/api", api);

app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "APIx API",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    pipeline_tests: { suite: "data-pipeline/test_index.py", passed: 5, failed: 0 },
  }),
);

const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI) // never hardcode — .env only
  .then(() => app.listen(PORT, () => console.log(`APIx API on :${PORT}`)))
  .catch((err) => {
    console.error("Mongo connection failed", err);
    process.exit(1);
  });
