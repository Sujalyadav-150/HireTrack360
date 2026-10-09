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
    return app(req, res);
  } catch (error) {
    console.error("Vercel API initialization failed:", error.message);
    return res.status(503).json({ success: false, message: "Service is temporarily unavailable. Check database configuration." });
  }
};
