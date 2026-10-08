require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cron = require("node-cron");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req,res) => {
  res.json({success:true, message:"HireTrack 360 API is running"});
});

app.get("/api/jobs", (req,res) => {
  res.json({success:true, jobs:[]});
});

// Background automation placeholder:
// Application Health, interview reminders and expired-job checks
cron.schedule("*/15 * * * *", async () => {
  console.log("[Cron] Running HireTrack background checks...");
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("MongoDB connected");
    } else {
      console.log("MONGODB_URI not configured; starting API in demo mode");
    }
    app.listen(PORT, () => console.log(`HireTrack API running on http://localhost:${PORT}`));
  } catch (error) {
    console.error("Startup error:", error.message);
    process.exit(1);
  }
}
start();
