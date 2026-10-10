require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../../backend/server");

let connectionPromise;

module.exports = async function sessionHandler(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGODB_URI) {
        return res.status(503).json({
          success: false,
          message: "Database is not configured. Set MONGODB_URI in Vercel project environment variables."
        });
      }
      if (!connectionPromise) {
        connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch(error => {
          connectionPromise = null;
          throw error;
        });
      }
      await connectionPromise;
    }

    const queryIndex = (req.url || "").indexOf("?");
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
    req.url = `/api/auth/me${query}`;
    return app(req, res);
  } catch (error) {
    console.error("Vercel session initialization failed:", error.message);
    return res.status(503).json({
      success: false,
      message: "Session service is temporarily unavailable. Check database configuration."
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
