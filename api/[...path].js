require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../backend/server");

let connectionPromise;

module.exports = async function handler(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGODB_URI) {
        res.status(503).json({ success: false, message: "Database is not configured. Set MONGODB_URI in Vercel project environment variables." });
        return;
      }
      if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch(error => {
          connectionPromise = null;
          throw error;
        });
      }
      await connectionPromise;
    }

    // Vercel catch-all and explicit function routes can differ in whether
    // the /api prefix is retained. Express routes are registered with /api.
    const originalUrl = req.url || "/";
    const pathOnly = originalUrl.split("?")[0];
    if (pathOnly === "/api" || pathOnly.startsWith("/api/")) {
      req.url = originalUrl;
    } else {
      req.url = `/api${originalUrl.startsWith("/") ? originalUrl : `/${originalUrl}`}`;
    }
    return app(req, res);
  } catch (error) {
    console.error("Vercel API initialization failed:", error.message);
    return res.status(503).json({ success: false, message: "Service is temporarily unavailable. Check database configuration." });
  }
};

// Multipart uploads must reach multer as an unconsumed request stream.
module.exports.config = {
  api: {
    bodyParser: false
  }
};
