require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../backend/server");

let connectionPromise;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) {
    const error = new Error("Database is not configured. Set MONGODB_URI in Vercel project environment variables.");
    error.statusCode = 503;
    throw error;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
    }).catch(error => {
      connectionPromise = null;
      throw error;
    });
  }
  await connectionPromise;
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
      message: "Database is unavailable. Verify MONGODB_URI and Atlas network access in the deployment environment."
    });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
