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
    // Vercel catch-all functions may strip the /api prefix before invoking
    // this handler, while Express routes are registered as /api/....
    // Normalize the path once so /recruiter/jobs reaches /api/recruiter/jobs.
    const originalUrl = req.url || "/";
    const pathOnly = originalUrl.split("?")[0];
    if (pathOnly !== "/api" && !pathOnly.startsWith("/api/")) {
      req.url = `/api${originalUrl.startsWith("/") ? originalUrl : `/${originalUrl}`}`;
    }
    return app(req, res);
  } catch (error) {
    console.error("Vercel API initialization failed:", error.message);
    return res.status(503).json({ success: false, message: "Service is temporarily unavailable. Check database configuration." });
  }
};

// Let Express/multer read multipart streams directly for resume uploads.
// Vercel's pre-parsing can consume the request stream before multer receives it.
module.exports.config = {
  api: {
    bodyParser: false
  }
};
