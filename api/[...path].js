require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../backend/server");

let connectionPromise;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) {
    const error = new Error("Database is not configured. Set MONGODB_URI in Vercel project environment variables.");
    error.statusCode = 503;
    throw error;
  }

  // Reuse one in-flight connection across concurrent requests in this serverless instance.
  if (!connectionPromise) {
    connectionPromise = (async () => {
      let lastError;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 15000),
            connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
            socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 45000),
            maxIdleTimeMS: 60000,
            retryReads: true,
            retryWrites: true
          });
          return;
        } catch (error) {
          lastError = error;
          // Clear a failed/half-open connection before one bounded retry.
          await mongoose.disconnect().catch(() => {});
          if (attempt < 2) await wait(400);
        }
      }
      throw lastError;
    })().catch(error => {
      connectionPromise = null;
      throw error;
    });
  }

  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  const originalUrl = req.url || "/";
  const pathOnly = originalUrl.split("?")[0];
  req.url = pathOnly === "/api" || pathOnly.startsWith("/api/")
    ? originalUrl
    : `/api${originalUrl.startsWith("/") ? originalUrl : `/${originalUrl}`}`;

  try {
    await connectDatabase();
    return app(req, res);
  } catch (error) {
    console.error("Vercel API initialization failed:", error.message);
    return res.status(503).json({
      success: false,
      code: "DATABASE_UNAVAILABLE",
      message: "Database is unavailable. Verify the Vercel MONGODB_URI value, Atlas cluster status, database user credentials, and Atlas Network Access rules."
    });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
