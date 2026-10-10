require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../../backend/server");
let connectionPromise;
module.exports = async function jobseekerDashboardHandler(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGODB_URI) return res.status(503).json({success:false,message:"Database is not configured."});
      if (!connectionPromise) connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch(error => { connectionPromise = null; throw error; });
      await connectionPromise;
    }
    req.url = "/api/jobseeker/dashboard";
    return app(req, res);
  } catch (error) {
    console.error("Vercel job seeker dashboard route failed:", error.message);
    return res.status(503).json({success:false,message:"Job seeker dashboard service is temporarily unavailable."});
  }
};
module.exports.config = { api: { bodyParser: false } };
