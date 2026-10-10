require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../../../backend/server");
let connectionPromise;
module.exports = async function recruiterApplicationHandler(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!process.env.MONGODB_URI) return res.status(503).json({success:false,message:"Database is not configured."});
      if (!connectionPromise) connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch(error => { connectionPromise = null; throw error; });
      await connectionPromise;
    }
    const id = req.query?.applicationId;
    if (!id || Array.isArray(id)) return res.status(400).json({success:false,message:"A valid application ID is required."});
    req.url = `/api/recruiter/applications/${encodeURIComponent(id)}`;
    return app(req, res);
  } catch (error) {
    console.error("Vercel recruiter application route failed:", error.message);
    return res.status(503).json({success:false,message:"Application status service is temporarily unavailable."});
  }
};
module.exports.config = { api: { bodyParser: false } };
