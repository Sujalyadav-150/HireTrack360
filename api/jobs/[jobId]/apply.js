require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../../../backend/server");

let connectionPromise;

module.exports = async function applyHandler(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGODB_URI) {
        return res.status(503).json({ success: false, message: "Database is not configured. Set MONGODB_URI in Vercel project environment variables." });
      }
      if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch(error => {
          connectionPromise = null;
          throw error;
        });
      }
      await connectionPromise;
    }
    const jobId = req.query?.jobId;
    if (!jobId || Array.isArray(jobId)) {
      return res.status(400).json({ success: false, message: "A valid job ID is required." });
    }
    req.url = `/api/jobs/${encodeURIComponent(jobId)}/apply`;
    return app(req, res);
  } catch (error) {
    console.error("Vercel apply route initialization failed:", error.message);
    return res.status(503).json({ success: false, message: "Application service is temporarily unavailable." });
  }
};
module.exports.config = { api: { bodyParser: false } };
