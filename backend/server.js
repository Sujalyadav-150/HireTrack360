require("dotenv").config();
require("express-async-errors");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const cron = require("node-cron");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const User = require("./models/User");
const Job = require("./models/Job");
const Application = require("./models/Application");
const Resume = require("./models/Resume");
const Interview = require("./models/Interview");
const Notification = require("./models/Notification");
const PushSubscription = require("./models/PushSubscription");
const ActivityLog = require("./models/ActivityLog");
const { calculateMatch, calculateTrust, calculateJobRisk } = require("./utils/scoring");
const { sendPasswordReset, sendInterviewEmail, sendApplicationStatusEmail } = require("./services/emailService");
const { createNotification, pushConfigured } = require("./services/notificationService");

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production"
  ? null
  : crypto.randomBytes(32).toString("hex"));
if (!jwtSecret || (process.env.NODE_ENV === "production" && process.env.JWT_SECRET.length < 32)) throw new Error("JWT_SECRET must be at least 32 characters in production");
if (!process.env.JWT_SECRET) console.warn("JWT_SECRET not configured; using a temporary development secret");

const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  strictTransportSecurity: process.env.NODE_ENV === "production" ? undefined : false
}));
app.use(cors({ origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : false }));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many authentication attempts. Try again later." }
});
app.use("/api/auth", authLimiter);

const uploadDirectory = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });
const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".doc", ".docx"].includes(extension)) return callback(null, true);
    callback(new Error("Resume must be a PDF, DOC, or DOCX file"));
  }
});

const allowedRoles = ["jobseeker", "recruiter"];

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    skills: user.skills,
    targetRole: user.targetRole,
    preferredTitles: user.preferredTitles,
    preferredLocations: user.preferredLocations,
    preferredJobTypes: user.preferredJobTypes,
    remotePreference: user.remotePreference,
    companyName: user.companyName,
    designation: user.designation,
    companyWebsite: user.companyWebsite,
    companyLocation: user.companyLocation,
    companyDescription: user.companyDescription,
    phone: user.phone,
    location: user.location,
    experience: user.experience,
    education: user.education,
    bio: user.bio,
    profileImage: user.profileImage,
    resumeVersions: user.resumeVersions
  };
}

function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), ver: user.tokenVersion || 0 }, jwtSecret, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
}

function sendAuthSuccess(res, user, status = 200) {
  const token = createToken(user);
  res.cookie("hiretrack_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400000
  });
  return res.status(status).json({ success: true, user: publicUser(user) });
}

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : req.cookies?.hiretrack_session;
  if (!token) return res.status(401).json({ success: false, message: "Sign in to continue" });

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ success: false, message: "Account not found" });
    if (!user.isActive || (payload.ver || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ success: false, message: "Your session is invalid or expired" });
    }
    if (user.role === "job_seeker") {
      user.role = "jobseeker";
      await user.save();
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: "Account role is not supported" });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Your session is invalid or expired" });
  }
}

async function optionalAuthenticate(req, _res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : req.cookies?.hiretrack_session;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);
    if (user?.isActive && (payload.ver || 0) === (user.tokenVersion || 0)) req.user = user;
  } catch {}
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ success: false, message: "You do not have access to this workspace" });
    }
    next();
  };
}

function recordActivity(actor, action, entityType, entityId, metadata = {}) {
  return ActivityLog.create({ actor, action, entityType, entityId, metadata })
    .catch(error => console.error("Activity log error:", error.message));
}

function roleName(role) {
  return role === "recruiter" ? "Recruiter" : "Job Seeker";
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role, skills, companyName } = req.body;
    if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim()) || typeof password !== "string") {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Choose jobseeker or recruiter" });
    }
    if (role === "recruiter" && !companyName?.trim()) {
      return res.status(400).json({ success: false, message: "Company name is required for recruiter accounts" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role,
      authProvider: "local",
      skills: role === "jobseeker" && typeof skills === "string"
        ? skills.split(",").map(skill => skill.trim()).filter(Boolean)
        : [],
      targetRole: role === "jobseeker" ? req.body.targetRole?.trim() : undefined,
      preferredTitles: role === "jobseeker" ? (Array.isArray(req.body.preferredTitles) ? req.body.preferredTitles : []).map(String).map(value => value.trim()).filter(Boolean) : [],
      preferredLocations: role === "jobseeker" ? (Array.isArray(req.body.preferredLocations) ? req.body.preferredLocations : String(req.body.preferredLocations || "").split(",")).map(String).map(value => value.trim()).filter(Boolean) : [],
      preferredJobTypes: role === "jobseeker" ? (Array.isArray(req.body.preferredJobTypes) ? req.body.preferredJobTypes : String(req.body.preferredJobTypes || "").split(",")).map(String).map(value => value.trim()).filter(Boolean) : [],
      remotePreference: ["ANY", "REMOTE", "ONSITE"].includes(req.body.remotePreference) ? req.body.remotePreference : "ANY",
      phone: req.body.phone?.trim(),
      location: role === "jobseeker" ? req.body.location?.trim() : undefined,
      experience: role === "jobseeker" ? req.body.experience?.trim() : undefined,
      education: role === "jobseeker" ? req.body.education?.trim() : undefined,
      bio: role === "jobseeker" ? req.body.bio?.trim() : undefined,
      companyName: role === "recruiter" ? companyName.trim() : undefined,
      designation: role === "recruiter" ? req.body.designation?.trim() : undefined,
      companyWebsite: role === "recruiter" ? req.body.companyWebsite?.trim() : undefined,
      companyLocation: role === "recruiter" ? req.body.companyLocation?.trim() : undefined,
      companyDescription: role === "recruiter" ? req.body.companyDescription?.trim() : undefined
    });
    await recordActivity(user._id, "USER_REGISTERED", "User", user._id, { role });
    sendAuthSuccess(res, user, 201);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }
    console.error("Registration error:", error.message);
    res.status(500).json({ success: false, message: "Could not create your account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password, expectedRole } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }
    const user = await User.findOne({ email }).select("+password");
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect" });
    }
    if (user.role === "job_seeker") {
      user.role = "jobseeker";
      await user.save();
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: "Account role is not supported" });
    }
    if (expectedRole && expectedRole !== user.role) {
      return res.status(403).json({ success: false, message: `Your account is registered as a ${roleName(user.role)}. Please continue as ${roleName(user.role)}.` });
    }
    await recordActivity(user._id, "USER_LOGGED_IN", "User", user._id, { role: user.role });
    sendAuthSuccess(res, user);
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ success: false, message: "Could not sign in" });
  }
});

const genericResetMessage = "If an account exists for this email, a reset link has been sent.";
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const user = email ? await User.findOne({ email }) : null;
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 20) * 60 * 1000);
      user.passwordResetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.passwordResetExpiresAt = expiresAt;
      await user.save();
      // Use the configured frontend URL when provided; otherwise use the host
      // that actually requested the reset. This makes local phone testing work
      // without generating a link to the phone's own localhost.
      const resetBaseUrl = process.env.FRONTEND_URL?.trim() || `${req.protocol}://${req.get("host")}`;
      await sendPasswordReset(user, token, resetBaseUrl);
    }
  } catch (error) {
    console.error("Password reset request error:", error.message);
  }
  res.json({ success: true, message: genericResetMessage });
});

app.get("/api/auth/verify-reset-token", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(400).json({ success: false, valid: false, message: "Reset token is invalid or expired" });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() } }).select("+passwordResetTokenHash +passwordResetExpiresAt");
  if (!user) return res.status(400).json({ success: false, valid: false, message: "Reset token is invalid or expired" });
  res.json({ success: true, valid: true });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ success: false, message: "A valid token and password of at least 8 characters are required" });
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() } }).select("+passwordResetTokenHash +passwordResetExpiresAt");
  if (!user) return res.status(400).json({ success: false, message: "Reset token is invalid or expired" });
  user.password = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await recordActivity(user._id, "PASSWORD_RESET", "User", user._id);
  res.json({ success: true, message: "Password reset successfully. Sign in with your new password." });
});

app.post("/api/auth/logout", authenticate, async (req, res) => {
  req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
  await req.user.save();
  res.clearCookie("hiretrack_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  res.json({ success: true, message: "Signed out" });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.get("/api/config", (req, res) => {
  res.json({
    success: true,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    pushConfigured
  });
});

app.patch("/api/jobseeker/profile", authenticate, requireRole("jobseeker"), async (req, res) => {
  const allowedFields = ["name", "phone", "location", "skills", "experience", "education", "bio", "targetRole", "preferredLocations", "preferredJobTypes", "remotePreference"];
  for (const field of allowedFields) {
    if (req.body[field] === undefined) continue;
    if (field === "skills") {
      req.user.skills = Array.isArray(req.body.skills) ? req.body.skills.map(String).map(skill => skill.trim()).filter(Boolean) : String(req.body.skills).split(",").map(skill => skill.trim()).filter(Boolean);
    } else if (field === "preferredLocations" || field === "preferredJobTypes") {
      const values = Array.isArray(req.body[field]) ? req.body[field] : String(req.body[field]).split(",");
      req.user[field] = values.map(String).map(value => value.trim()).filter(Boolean).slice(0, 20);
    } else if (field === "remotePreference") {
      if (!["ANY", "REMOTE", "ONSITE"].includes(req.body[field])) return res.status(400).json({ success: false, message: "Choose a valid remote preference" });
      req.user.remotePreference = req.body[field];
    } else if (typeof req.body[field] !== "string") {
      return res.status(400).json({ success: false, message: `${field} must be text` });
    } else {
      req.user[field] = req.body[field].trim().slice(0, field === "bio" ? 2000 : 200);
    }
  }
  await req.user.save();
  res.json({ success: true, user: publicUser(req.user) });
});

app.get("/api/jobs", optionalAuthenticate, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const filter = { status: "OPEN", $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] };
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (query) filter.$text = { $search: query };
    if (typeof req.query.location === "string" && req.query.location.trim()) {
      filter.location = { $regex: req.query.location.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (typeof req.query.type === "string" && req.query.type.trim()) filter.employmentType = req.query.type.trim();
    if (req.query.remote === "true") filter.remote = true;
    if (typeof req.query.experience === "string" && req.query.experience.trim()) {
      filter.experience = { $regex: req.query.experience.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (["1", "7", "30", "90"].includes(String(req.query.postedWithin || ""))) {
      filter.createdAt = { $gte: new Date(Date.now() - Number(req.query.postedWithin) * 86400000) };
    }
    if (req.query.skills) {
      const skills = String(req.query.skills).split(",").map(skill => skill.trim()).filter(Boolean).slice(0, 10);
      if (skills.length) filter.$and = [...(filter.$and || []), { $or: [{ skills: { $in: skills } }, { requiredSkills: { $in: skills } }] }];
    }
    const minSalary = Number(req.query.salaryMin);
    const maxSalary = Number(req.query.salaryMax);
    if (Number.isFinite(minSalary) && minSalary > 0) filter.salaryMax = { $gte: minSalary };
    if (Number.isFinite(maxSalary) && maxSalary > 0) filter.salaryMin = { ...(filter.salaryMin || {}), $lte: maxSalary };
    const [jobs, total] = await Promise.all([
      Job.find(filter).sort(query ? { score: { $meta: "textScore" }, createdAt: -1 } : { createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Job.countDocuments(filter)
    ]);
    const personalizedJobs = req.user?.role === "jobseeker" ? jobs.map(job => {
      const match = calculateMatch(req.user, job);
      return { ...job, matchScore: match.score, match, matchExplanation: match.explanations };
    }) : jobs;
    res.json({ success: true, jobs: personalizedJobs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Job list error:", error.message);
    res.status(500).json({ success: false, message: "Could not load jobs" });
  }
});

app.get("/api/jobs/recommended", authenticate, requireRole("jobseeker"), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = { status: "OPEN", $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] };
  const candidateSkills = (req.user.skills || []).map(skill => skill.trim()).filter(Boolean).slice(0, 25);
  const searchText = [req.user.targetRole, ...(req.user.preferredTitles || [])].filter(Boolean).join(" ").trim();
  const relevanceFilters = [];
  if (candidateSkills.length) relevanceFilters.push({ $or: [{ requiredSkills: { $in: candidateSkills.map(skill => new RegExp(`^${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) } }, { skills: { $in: candidateSkills.map(skill => new RegExp(`^${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) } }] });
  if (searchText) relevanceFilters.push({ $text: { $search: searchText } });
  if (relevanceFilters.length) filter.$and = relevanceFilters;
  const pool = await Job.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  const ranked = pool.map(job => {
    const match = calculateMatch(req.user, job);
    return { ...job, matchScore: match.score, match, matchExplanation: match.explanations };
  }).sort((first, second) => second.matchScore - first.matchScore || new Date(second.createdAt) - new Date(first.createdAt));
  const total = ranked.length;
  res.json({ success: true, jobs: ranked.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, pages: Math.ceil(total / limit) }, formula: "Jobs ranked by the same weighted profile/job match score used on job details." });
});

app.get("/api/jobs/:jobId", optionalAuthenticate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ success: false, message: "Job not found" });
  try {
    const job = await Job.findById(req.params.jobId).populate("recruiterId", "companyName companyWebsite companyDescription isActive").lean();
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const safety = calculateJobRisk(job, job.recruiterId);
    const trust = calculateTrust(job, job.recruiterId);
    const match = req.user?.role === "jobseeker" ? calculateMatch(req.user, job) : null;
    res.json({ success: true, job, safety, trust, match, matchFormula: match?.formula });
  } catch (error) {
    console.error("Job detail error:", error.message);
    res.status(500).json({ success: false, message: "Could not load this job" });
  }
});

app.get("/api/jobs/:jobId/match", authenticate, requireRole("jobseeker"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ success: false, message: "Job not found" });
  const job = await Job.findById(req.params.jobId).lean();
  if (!job) return res.status(404).json({ success: false, message: "Job not found" });
  res.json({ success: true, match: calculateMatch(req.user, job) });
});

app.get("/api/jobseeker/dashboard", authenticate, requireRole("jobseeker"), async (req, res) => {
  try {
    const [applications, savedJobs, interviews, resumes, unreadNotifications] = await Promise.all([
      Application.find({ candidateId: req.user._id }).populate("jobId").sort({ createdAt: -1 }).lean(),
      Job.find({ _id: { $in: req.user.savedJobs || [] }, status: "OPEN" }).sort({ createdAt: -1 }).lean(),
      Interview.find({ candidateId: req.user._id, status: "SCHEDULED", scheduledAt: { $gte: new Date() } }).populate("jobId", "title company").sort({ scheduledAt: 1 }).lean(),
      Resume.find({ userId: req.user._id }).select("name targetRole fileName size uploadedAt createdAt").sort({ uploadedAt: -1 }).lean(),
      Notification.countDocuments({ userId: req.user._id, read: false })
    ]);
    const now = Date.now();
    const staleApplications = applications.filter(application =>
      !["OFFERED", "ACCEPTED", "REJECTED"].includes(application.status) &&
      now - new Date(application.lastUpdatedAt || application.lastUpdated || application.createdAt).getTime() >= 7 * 86400000
    ).map(application => application._id);
    res.json({ success: true, applications, savedJobs, interviews, resumes, staleApplications, unreadNotifications, user: publicUser(req.user) });
  } catch (error) {
    console.error("Candidate dashboard error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your dashboard" });
  }
});

app.post("/api/jobs/:jobId/save", authenticate, requireRole("jobseeker"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ success: false, message: "Job not found" });
    const job = await Job.findOne({ _id: req.params.jobId, status: "OPEN", $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const saved = (req.user.savedJobs || []).some(id => id.toString() === job._id.toString());
    req.user.savedJobs = saved
      ? req.user.savedJobs.filter(id => id.toString() !== job._id.toString())
      : [...(req.user.savedJobs || []), job._id];
    await req.user.save();
    res.json({ success: true, saved: !saved });
  } catch (error) {
    console.error("Save job error:", error.message);
    res.status(500).json({ success: false, message: "Could not update saved jobs" });
  }
});

app.post("/api/jobs/:jobId/apply", authenticate, requireRole("jobseeker"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ success: false, message: "Job not found" });
    const job = await Job.findOne({ _id: req.params.jobId, status: "OPEN", $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const existing = await Application.findOne({ jobId: job._id, candidateId: req.user._id });
    if (existing) return res.status(409).json({ success: false, message: "You already applied to this job" });
    let resume;
    if (req.body.resumeId) {
      if (!mongoose.isValidObjectId(req.body.resumeId)) return res.status(400).json({ success: false, message: "Resume selection is invalid" });
      resume = await Resume.findOne({ _id: req.body.resumeId, userId: req.user._id });
      if (!resume) return res.status(404).json({ success: false, message: "Resume not found" });
    }
    const match = calculateMatch(req.user, job);
    const application = await Application.create({
      jobId: job._id,
      candidateId: req.user._id,
      resumeId: resume?._id,
      resumeVersion: resume?.name,
      matchScore: match.score,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      matchComponents: match.components,
      matchExplanation: match.explanations
    });
    await recordActivity(req.user._id, "APPLICATION_SUBMITTED", "Application", application._id, { jobId: job._id });
    await createNotification({
      userId: job.recruiterId,
      type: "NEW_APPLICATION",
      title: "New job application",
      message: `${req.user.name} applied for ${job.title}.`,
      link: "/recruiter-dashboard.html#applications"
    });
    res.status(201).json({ success: true, application });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "You already applied to this job" });
    console.error("Job application error:", error.message);
    res.status(500).json({ success: false, message: "Could not submit your application" });
  }
});

app.get("/api/recruiter/dashboard", authenticate, requireRole("recruiter"), async (req, res) => {
  try {
    const jobs = await Job.find({ recruiterId: req.user._id }).sort({ createdAt: -1 }).lean();
    const jobIds = jobs.map(job => job._id);
    const applications = await Application.find({ jobId: { $in: jobIds } })
      .populate("candidateId", "name email skills experience education location targetRole preferredTitles preferredLocations preferredJobTypes remotePreference resumeVersions")
      .populate("jobId", "title company location employmentType skills requiredSkills experience educationRequirements remote")
      .sort({ createdAt: -1 })
      .lean();
    const [openJobs, totalApplications, newApplications, shortlistedCandidates, interviewsScheduled, jobsClosed, offers, hires] = await Promise.all([
      Job.countDocuments({ recruiterId: req.user._id, status: "OPEN" }),
      Application.countDocuments({ jobId: { $in: jobIds } }),
      Application.countDocuments({ jobId: { $in: jobIds }, status: "APPLIED" }),
      Application.countDocuments({ jobId: { $in: jobIds }, status: "SHORTLISTED" }),
      Application.countDocuments({ jobId: { $in: jobIds }, status: "INTERVIEW" }),
      Job.countDocuments({ recruiterId: req.user._id, status: "CLOSED" }),
      Application.countDocuments({ jobId: { $in: jobIds }, status: "OFFERED" }),
      Application.countDocuments({ jobId: { $in: jobIds }, status: "ACCEPTED" })
    ]);
    const decoratedApplications = applications.map(application => {
      const candidate = application.candidateId || {};
      const job = application.jobId || {};
      const match = calculateMatch(candidate, job);
      return {
        ...application,
        matchScore: application.matchScore ?? match.score,
        matchComponents: application.matchComponents || match.components,
        matchExplanation: application.matchExplanation?.length ? application.matchExplanation : match.explanations,
        matchedSkills: application.matchedSkills?.length ? application.matchedSkills : match.matchedSkills,
        missingSkills: application.missingSkills?.length ? application.missingSkills : match.missingSkills
      };
    });
    res.json({
      success: true,
      user: publicUser(req.user),
      jobs: jobs.map(job => ({
        ...job,
        applicationCount: applications.filter(application => application.jobId?._id?.toString() === job._id.toString()).length
      })),
      applications: decoratedApplications,
      stats: {
        openJobs, totalApplications, newApplications, shortlistedCandidates, interviewsScheduled, jobsClosed, offers, hires,
        shortlistRate: totalApplications ? Math.round(shortlistedCandidates / totalApplications * 100) : 0,
        interviewRate: totalApplications ? Math.round(interviewsScheduled / totalApplications * 100) : 0,
        offerRate: totalApplications ? Math.round(offers / totalApplications * 100) : 0,
        hireRate: totalApplications ? Math.round(hires / totalApplications * 100) : 0
      }
    });
  } catch (error) {
    console.error("Recruiter dashboard error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your hiring dashboard" });
  }
});

app.patch("/api/recruiter/profile", authenticate, requireRole("recruiter"), async (req, res) => {
  try {
    const { name, companyName, designation, companyWebsite, companyLocation, companyDescription } = req.body;
    if (!name?.trim() || !companyName?.trim()) {
      return res.status(400).json({ success: false, message: "Name and company name are required" });
    }
    req.user.name = name.trim();
    req.user.companyName = companyName.trim();
    if (designation !== undefined) req.user.designation = String(designation).trim();
    if (companyWebsite !== undefined) {
      const website = String(companyWebsite).trim();
      if (website && !/^https?:\/\//i.test(website)) return res.status(400).json({ success: false, message: "Company website must start with http:// or https://" });
      req.user.companyWebsite = website;
    }
    if (companyLocation !== undefined) req.user.companyLocation = String(companyLocation).trim();
    if (companyDescription !== undefined) req.user.companyDescription = String(companyDescription).trim().slice(0, 3000);
    await req.user.save();
    res.json({ success: true, user: publicUser(req.user) });
  } catch (error) {
    console.error("Update recruiter profile error:", error.message);
    res.status(500).json({ success: false, message: "Could not update your company profile" });
  }
});

app.post("/api/recruiter/jobs", authenticate, requireRole("recruiter"), async (req, res) => {
  try {
    const { title, location, employmentType, description, skills, requiredSkills, salaryMin, salaryMax, remote, experience, educationRequirements, responsibilities, deadline, externalLinks } = req.body;
    if (!title?.trim() || !location?.trim() || !description?.trim()) {
      return res.status(400).json({ success: false, message: "Job title, location, and description are required" });
    }
    const jobFields = {
      title: title.trim(),
      company: req.user.companyName || req.user.name,
      location: location.trim(),
      employmentType: employmentType || "Full-time",
      description: description.trim(),
      skills: Array.isArray(skills) ? skills : String(skills || "").split(",").map(skill => skill.trim()).filter(Boolean),
      requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : String(requiredSkills || skills || "").split(",").map(skill => skill.trim()).filter(Boolean),
      responsibilities: Array.isArray(responsibilities) ? responsibilities : String(responsibilities || "").split("\n").map(item => item.trim()).filter(Boolean),
      educationRequirements: typeof educationRequirements === "string" ? educationRequirements.trim().slice(0, 200) : undefined,
      contactEmail: req.user.email,
      externalLinks: Array.isArray(externalLinks) ? externalLinks.filter(link => typeof link === "string" && /^https?:\/\//i.test(link)).slice(0, 10) : [],
      remote: Boolean(remote),
      experience,
      salaryMin: Number(salaryMin) || undefined,
      salaryMax: Number(salaryMax) || undefined,
      deadline: deadline ? new Date(deadline) : undefined,
      recruiterId: req.user._id
    };
    const safety = calculateJobRisk(jobFields, req.user);
    const job = await Job.create({
      ...jobFields,
      trustScore: 100 - safety.riskScore,
      trustSignals: safety.positiveSignals,
      trustWarnings: safety.warnings,
      riskScore: safety.riskScore,
      riskLevel: safety.riskLevel,
      riskSignals: safety.positiveSignals,
      riskWarnings: safety.warnings,
      riskEvidence: safety.evidence,
      reviewRequired: safety.riskLevel !== "LOW"
    });
    await recordActivity(req.user._id, "JOB_CREATED", "Job", job._id, { title: job.title });
    res.status(201).json({ success: true, job });
  } catch (error) {
    console.error("Create job error:", error.message);
    res.status(500).json({ success: false, message: "Could not post this job" });
  }
});

app.patch("/api/recruiter/jobs/:jobId", authenticate, requireRole("recruiter"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(404).json({ success: false, message: "Job not found" });
    const status = req.body.status;
    if (status === undefined) {
      const editable = ["title", "location", "employmentType", "description", "skills", "requiredSkills", "responsibilities", "remote", "salaryMin", "salaryMax", "experience", "educationRequirements", "deadline", "externalLinks"];
      const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => editable.includes(key)));
      const job = await Job.findOne({ _id: req.params.jobId, recruiterId: req.user._id });
      if (!job) return res.status(404).json({ success: false, message: "Job not found" });
      Object.assign(job, updates);
      const safety = calculateJobRisk(job, req.user);
      job.trustScore = 100 - safety.riskScore;
      job.trustSignals = safety.positiveSignals;
      job.trustWarnings = safety.warnings;
      job.riskScore = safety.riskScore;
      job.riskLevel = safety.riskLevel;
      job.riskSignals = safety.positiveSignals;
      job.riskWarnings = safety.warnings;
      job.riskEvidence = safety.evidence;
      job.reviewRequired = safety.riskLevel !== "LOW";
      await job.save();
      await recordActivity(req.user._id, "JOB_EDITED", "Job", job._id, { title: job.title });
      return res.json({ success: true, job });
    }
    if (!["OPEN", "CLOSED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Job status must be OPEN or CLOSED" });
    }
    const job = await Job.findOneAndUpdate(
      { _id: req.params.jobId, recruiterId: req.user._id },
      { status },
      { new: true, runValidators: true }
    );
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    await recordActivity(req.user._id, status === "CLOSED" ? "JOB_CLOSED" : "JOB_REOPENED", "Job", job._id);
    res.json({ success: true, job });
  } catch (error) {
    console.error("Update job error:", error.message);
    res.status(500).json({ success: false, message: "Could not update this job" });
  }
});

app.patch("/api/recruiter/applications/:applicationId", authenticate, requireRole("recruiter"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.applicationId)) return res.status(404).json({ success: false, message: "Application not found" });
    const allowedStatuses = ["SCREENING", "SHORTLISTED", "INTERVIEW", "OFFERED", "ACCEPTED", "REJECTED"];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: "Choose a valid application status" });
    }
    const application = await Application.findById(req.params.applicationId).populate("jobId", "recruiterId");
    if (!application || !application.jobId || application.jobId.recruiterId?.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    if (application.status === req.body.status) return res.json({ success: true, application, unchanged: true });
    application.status = req.body.status;
    if (req.body.status === "INTERVIEW" && req.body.interviewDate) {
      application.interviewDate = new Date(req.body.interviewDate);
    }
    application.lastUpdated = new Date();
    await application.save();
    const job = await Job.findById(application.jobId).lean();
    await recordActivity(req.user._id, "APPLICATION_STATUS_CHANGED", "Application", application._id, { status: application.status });
    await createNotification({
      userId: application.candidateId,
      type: "APPLICATION_STATUS",
      title: "Application update",
      message: `Your application for ${job?.title || "a job"} moved to ${application.status}.`,
      link: "/dashboard.html#applications"
    });
    const candidate = await User.findById(application.candidateId);
    if (candidate && job) await sendApplicationStatusEmail(candidate, { jobTitle: job.title, company: job.company, status: application.status });
    res.json({ success: true, application });
  } catch (error) {
    console.error("Update application error:", error.message);
    res.status(500).json({ success: false, message: "Could not update this application" });
  }
});

app.get("/api/applications/mine", authenticate, requireRole("jobseeker"), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [applications, total] = await Promise.all([
    Application.find({ candidateId: req.user._id }).populate("jobId").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Application.countDocuments({ candidateId: req.user._id })
  ]);
  res.json({ success: true, applications, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

app.get("/api/applications/recruiter", authenticate, requireRole("recruiter"), async (req, res) => {
  const ownedJobs = await Job.find({ recruiterId: req.user._id }).select("_id").lean();
  const filter = { jobId: { $in: ownedJobs.map(job => job._id) } };
  if (req.query.status && ["APPLIED", "SCREENING", "SHORTLISTED", "INTERVIEW", "OFFERED", "ACCEPTED", "REJECTED"].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.jobId && mongoose.isValidObjectId(req.query.jobId)) filter.jobId = req.query.jobId;
  const applications = await Application.find(filter)
    .populate("candidateId", "name email skills experience location resumeVersions")
    .populate("jobId", "title company")
    .sort({ createdAt: -1 }).lean();
  res.json({ success: true, applications });
});

app.get("/api/resumes/mine", authenticate, requireRole("jobseeker"), async (req, res) => {
  const resumes = await Resume.find({ userId: req.user._id }).select("name targetRole fileName size mimeType uploadedAt createdAt").sort({ uploadedAt: -1 }).lean();
  res.json({ success: true, resumes });
});

app.post("/api/resumes/upload", authenticate, requireRole("jobseeker"), resumeUpload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Choose a resume file" });
  try {
    const resume = await Resume.create({
      userId: req.user._id,
      name: (req.body.name || path.parse(req.file.originalname).name).trim().slice(0, 100),
      targetRole: req.body.targetRole?.trim().slice(0, 100),
      fileName: path.basename(req.file.originalname),
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });
    req.user.resumeVersions.push({ name: resume.name, url: `/api/resumes/${resume._id}/download`, targetRole: resume.targetRole });
    await req.user.save();
    await recordActivity(req.user._id, "RESUME_UPLOADED", "Resume", resume._id);
    res.status(201).json({ success: true, resume: { id: resume._id, name: resume.name, targetRole: resume.targetRole, fileName: resume.fileName, uploadedAt: resume.uploadedAt } });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    console.error("Resume upload error:", error.message);
    res.status(500).json({ success: false, message: "Could not save this resume" });
  }
});

app.get("/api/resumes/:resumeId/download", authenticate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.resumeId)) return res.status(404).json({ success: false, message: "Resume not found" });
  const resume = await Resume.findById(req.params.resumeId).select("+path");
  if (!resume) return res.status(404).json({ success: false, message: "Resume not found" });
  let authorized = req.user.role === "jobseeker" && resume.userId.toString() === req.user._id.toString();
  if (!authorized && req.user.role === "recruiter") {
    const applications = await Application.find({ candidateId: resume.userId, resumeId: resume._id }).select("jobId").lean();
    const job = applications.length ? await Job.exists({ _id: { $in: applications.map(application => application.jobId) }, recruiterId: req.user._id }) : null;
    authorized = Boolean(job);
  }
  if (!authorized) return res.status(403).json({ success: false, message: "You cannot access this resume" });
  if (!fs.existsSync(resume.path)) return res.status(404).json({ success: false, message: "Resume file is no longer available" });
  res.download(resume.path, resume.fileName);
});

app.delete("/api/resumes/:resumeId", authenticate, requireRole("jobseeker"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.resumeId)) return res.status(404).json({ success: false, message: "Resume not found" });
  const resume = await Resume.findOne({ _id: req.params.resumeId, userId: req.user._id }).select("+path");
  if (!resume) return res.status(404).json({ success: false, message: "Resume not found" });
  await Promise.all([
    Application.updateMany({ candidateId: req.user._id, resumeId: resume._id }, { $unset: { resumeId: 1 } }),
    Resume.deleteOne({ _id: resume._id }),
    fs.promises.unlink(resume.path).catch(() => {})
  ]);
  req.user.resumeVersions = req.user.resumeVersions.filter(item => !item.url?.includes(resume._id.toString()));
  await req.user.save();
  res.json({ success: true, message: "Resume deleted" });
});

app.get("/api/interviews/mine", authenticate, async (req, res) => {
  const filter = req.user.role === "recruiter" ? { recruiterId: req.user._id } : { candidateId: req.user._id };
  const interviews = await Interview.find(filter).populate("jobId", "title company").populate("candidateId", "name email").sort({ scheduledAt: 1 }).lean();
  res.json({ success: true, interviews });
});

app.post("/api/interviews", authenticate, requireRole("recruiter"), async (req, res) => {
  const { applicationId, scheduledAt, interviewType, meetingLink, notes } = req.body;
  if (!mongoose.isValidObjectId(applicationId) || !scheduledAt || !Number.isFinite(new Date(scheduledAt).getTime()) || new Date(scheduledAt) <= new Date()) {
    return res.status(400).json({ success: false, message: "Choose a valid application and a future interview date" });
  }
  const application = await Application.findById(applicationId).populate("jobId", "recruiterId title company");
  if (!application || !application.jobId || application.jobId.recruiterId?.toString() !== req.user._id.toString()) {
    return res.status(404).json({ success: false, message: "Application not found" });
  }
  try {
    const interview = await Interview.create({
      applicationId: application._id,
      jobId: application.jobId._id,
      candidateId: application.candidateId,
      recruiterId: req.user._id,
      scheduledAt: new Date(scheduledAt),
      interviewType: ["VIDEO", "PHONE", "ONSITE"].includes(interviewType) ? interviewType : "VIDEO",
      meetingLink: typeof meetingLink === "string" ? meetingLink.trim().slice(0, 500) : "",
      notes: typeof notes === "string" ? notes.trim().slice(0, 2000) : ""
    });
    application.status = "INTERVIEW";
    application.interviewDate = interview.scheduledAt;
    await application.save();
    await createNotification({ userId: application.candidateId, type: "INTERVIEW_SCHEDULED", title: "Interview scheduled", message: `${application.jobId.company} scheduled an interview for ${application.jobId.title} on ${interview.scheduledAt.toLocaleString()}.`, link: "/dashboard.html#interviews" });
    const candidate = await User.findById(application.candidateId);
    if (candidate) await sendInterviewEmail(candidate, { jobTitle: application.jobId.title, company: application.jobId.company, scheduledAt: interview.scheduledAt, meetingLink: interview.meetingLink });
    await recordActivity(req.user._id, "INTERVIEW_SCHEDULED", "Interview", interview._id, { applicationId: application._id });
    res.status(201).json({ success: true, interview });
  } catch (error) {
    console.error("Interview scheduling error:", error.message);
    res.status(500).json({ success: false, message: "Could not schedule this interview" });
  }
});

app.patch("/api/interviews/:interviewId", authenticate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.interviewId)) return res.status(404).json({ success: false, message: "Interview not found" });
  if (!["SCHEDULED", "COMPLETED", "CANCELLED"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Choose a valid interview status" });
  const interview = await Interview.findById(req.params.interviewId);
  if (!interview) return res.status(404).json({ success: false, message: "Interview not found" });
  const ownsInterview = req.user.role === "recruiter"
    ? interview.recruiterId.toString() === req.user._id.toString()
    : interview.candidateId.toString() === req.user._id.toString();
  if (!ownsInterview) return res.status(403).json({ success: false, message: "You cannot update this interview" });
  interview.status = req.body.status;
  await interview.save();
  res.json({ success: true, interview });
});

app.get("/api/notifications/mine", authenticate, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId: req.user._id, read: false })
  ]);
  res.json({ success: true, notifications, unreadCount });
});

app.patch("/api/notifications/read-all", authenticate, async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ success: true, message: "Notifications marked as read" });
});

app.patch("/api/notifications/:notificationId/read", authenticate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.notificationId)) return res.status(404).json({ success: false, message: "Notification not found" });
  const notification = await Notification.findOneAndUpdate({ _id: req.params.notificationId, userId: req.user._id }, { read: true }, { new: true });
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
  res.json({ success: true, notification });
});

app.post("/api/push/subscribe", authenticate, async (req, res) => {
  const subscription = req.body;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ success: false, message: "A valid browser push subscription is required" });
  }
  await PushSubscription.findOneAndUpdate(
    { userId: req.user._id, endpoint: subscription.endpoint },
    { $set: { keys: subscription.keys } },
    { upsert: true, new: true, runValidators: true }
  );
  res.status(201).json({ success: true, configured: pushConfigured });
});

app.delete("/api/push/unsubscribe", authenticate, async (req, res) => {
  if (!req.body.endpoint) return res.status(400).json({ success: false, message: "Subscription endpoint is required" });
  await PushSubscription.deleteOne({ userId: req.user._id, endpoint: req.body.endpoint });
  res.json({ success: true });
});

app.post("/api/push/test", authenticate, async (req, res) => {
  if (!pushConfigured) return res.status(503).json({ success: false, message: "Web Push is not configured" });
  await createNotification({ userId: req.user._id, type: "PUSH_TEST", title: "HireTrack 360 test notification", message: "Browser notifications are connected.", link: "/notifications.html" });
  res.json({ success: true, message: "Test notification sent" });
});

app.get("/api/analytics/mine", authenticate, requireRole("jobseeker"), async (req, res) => {
  const applications = await Application.find({ candidateId: req.user._id }).select("status createdAt lastUpdatedAt lastUpdated").lean();
  const counts = Object.fromEntries(["APPLIED", "SCREENING", "SHORTLISTED", "INTERVIEW", "OFFERED", "ACCEPTED", "REJECTED"].map(status => [status, applications.filter(application => application.status === status).length]));
  const staleApplications = applications.filter(application => !["OFFERED", "ACCEPTED", "REJECTED"].includes(application.status) && Date.now() - new Date(application.lastUpdatedAt || application.lastUpdated || application.createdAt).getTime() >= 7 * 86400000).length;
  const interviews = counts.INTERVIEW;
  const offers = counts.OFFERED + counts.ACCEPTED;
  res.json({ success: true, counts, staleApplications, interviewConversionRate: applications.length ? Math.round(interviews / applications.length * 100) : 0, offerConversionRate: applications.length ? Math.round(offers / applications.length * 100) : 0 });
});

app.get("/api/analytics/recruiter", authenticate, requireRole("recruiter"), async (req, res) => {
  const jobs = await Job.find({ recruiterId: req.user._id }).select("_id title status createdAt").lean();
  const jobIds = jobs.map(job => job._id);
  const applications = await Application.find({ jobId: { $in: jobIds } }).select("jobId status").lean();
  const count = status => applications.filter(application => application.status === status).length;
  const total = applications.length;
  res.json({ success: true, jobsPosted: jobs.length, activeJobs: jobs.filter(job => job.status === "OPEN").length, applicants: total, shortlisted: count("SHORTLISTED"), interviews: count("INTERVIEW"), offers: count("OFFERED"), hires: count("ACCEPTED"), shortlistRate: total ? Math.round(count("SHORTLISTED") / total * 100) : 0, interviewRate: total ? Math.round(count("INTERVIEW") / total * 100) : 0, applicationsPerJob: jobs.map(job => ({ title: job.title, count: applications.filter(application => application.jobId.toString() === job._id.toString()).length })) });
});

app.get("/api/activity/mine", authenticate, async (req, res) => {
  const activities = await ActivityLog.find({ actor: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ success: true, activities });
});

const cronEnabled = process.env.CRON_ENABLED !== "false";

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    app: "HireTrack 360",
    environment: process.env.NODE_ENV || "development",
    databaseConnected: mongoose.connection.readyState === 1,
    pushConfigured,
    cronEnabled,
    timestamp: new Date().toISOString()
  });
});

const frontendDirectory = path.join(__dirname, "../frontend");
app.get("/register.html", (_req, res) => res.sendFile(path.join(frontendDirectory, "signup.html")));
app.get("/seeker.html", (_req, res) => res.sendFile(path.join(frontendDirectory, "dashboard.html")));
app.get("/recruiter.html", (_req, res) => res.sendFile(path.join(frontendDirectory, "recruiter-dashboard.html")));
app.get("/jobs.html", (_req, res) => res.redirect("/dashboard.html#find-jobs"));
app.get("/job-details.html", (_req, res) => res.redirect("/dashboard.html#find-jobs"));
app.get("/applications.html", (_req, res) => res.redirect("/dashboard.html#applications"));
app.get("/saved-jobs.html", (_req, res) => res.redirect("/dashboard.html#saved-jobs"));
app.get("/resumes.html", (_req, res) => res.redirect("/dashboard.html#profile"));
app.get("/interviews.html", (_req, res) => res.redirect("/dashboard.html#interviews"));
app.get("/analytics.html", (_req, res) => res.redirect("/dashboard.html#analytics"));
app.get("/notifications.html", (_req, res) => res.redirect("/dashboard.html#notifications"));
app.get("/profile.html", (_req, res) => res.redirect("/dashboard.html#profile"));
app.get("/post-job.html", (_req, res) => res.redirect("/recruiter-dashboard.html#post-job"));
app.get("/my-jobs.html", (_req, res) => res.redirect("/recruiter-dashboard.html#my-jobs"));
app.get("/applicants.html", (_req, res) => res.redirect("/recruiter-dashboard.html#applications"));
app.get("/company-profile.html", (_req, res) => res.redirect("/recruiter-dashboard.html#company"));
app.use("/api", (_req, res) => res.status(404).json({ success: false, message: "API endpoint not found" }));
app.use(express.static(frontendDirectory, { extensions: ["html"] }));
app.get("*", (_req, res) => res.sendFile(path.join(frontendDirectory, "index.html")));

async function runAutomation(now = new Date()) {
  const expiredJobs = await Job.find({ status: "OPEN", deadline: { $lte: now } }).select("_id recruiterId title").lean();
  if (expiredJobs.length) {
    await Job.updateMany({ _id: { $in: expiredJobs.map(job => job._id) } }, { $set: { status: "CLOSED" } });
    await Promise.all(expiredJobs.map(job => recordActivity(job.recruiterId, "JOB_EXPIRED", "Job", job._id, { title: job.title })));
  }

  const staleBefore = new Date(now.getTime() - 7 * 86400000);
  const staleApplications = await Application.find({
    status: { $nin: ["OFFERED", "ACCEPTED", "REJECTED"] },
    followUpRequired: false,
    $or: [{ lastUpdatedAt: { $lte: staleBefore } }, { lastUpdatedAt: { $exists: false }, lastUpdated: { $lte: staleBefore } }]
  }).populate("candidateId", "name").populate("jobId", "title company");
  for (const application of staleApplications) {
    application.followUpRequired = true;
    application.followUpNotifiedAt = now;
    await application.save();
    if (application.candidateId && application.jobId) {
      await createNotification({
        userId: application.candidateId._id,
        type: "APPLICATION_FOLLOW_UP",
        title: "Application needs follow-up",
        message: `Your application for ${application.jobId.title} at ${application.jobId.company} has not changed for 7 days. Consider following up.`,
        link: "/dashboard.html#applications",
        dedupeKey: `stale-application-${application._id}`
      });
    }
  }

  const reminderWindows = [
    { field: "reminder24hSentAt", start: 23.75, end: 24, label: "tomorrow" },
    { field: "reminder1hSentAt", start: 0.75, end: 1, label: "in about one hour" }
  ];
  for (const reminder of reminderWindows) {
    const start = new Date(now.getTime() + reminder.start * 3600000);
    const end = new Date(now.getTime() + reminder.end * 3600000);
    const interviews = await Interview.find({ status: "SCHEDULED", scheduledAt: { $gt: start, $lte: end }, [reminder.field]: { $exists: false } })
      .populate("jobId", "title company").populate("candidateId", "name");
    for (const interview of interviews) {
      interview[reminder.field] = now;
      await interview.save();
      if (!interview.jobId || !interview.candidateId) continue;
      await createNotification({
        userId: interview.candidateId._id,
        type: "INTERVIEW_REMINDER",
        title: "Upcoming interview",
        message: `${interview.jobId.company} interview for ${interview.jobId.title} is ${reminder.label}.${interview.meetingLink ? ` Meeting: ${interview.meetingLink}` : ""}`,
        link: "/dashboard.html#interviews",
        dedupeKey: `interview-${interview._id}-${reminder.field}`
      });
    }
  }
}

if (cronEnabled) {
  cron.schedule("*/15 * * * *", () => runAutomation().catch(error => console.error("Automation run failed:", error.message)), {
    timezone: process.env.CRON_TIMEZONE || "Asia/Kolkata"
  });
}

const PORT = process.env.PORT || 5000;
const FRONTEND_PORT = process.env.FRONTEND_PORT || (process.env.NODE_ENV === "production" ? null : 8000);

async function start() {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("MongoDB connected");
    } else {
      console.log("MONGODB_URI not configured; starting API in demo mode");
    }
    app.use((error, _req, res, _next) => {
      console.error("Request error:", error.message);
      const status = error instanceof multer.MulterError ? 400 : 500;
      res.status(status).json({ success: false, message: error instanceof multer.MulterError ? "Resume upload failed or exceeded 5 MB" : error.message.includes("Resume must be") ? error.message : "An unexpected server error occurred" });
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Push notifications ${pushConfigured ? "configured" : "unconfigured"}`);
      console.log(`Cron ${cronEnabled ? "enabled" : "disabled"}`);
      console.log(`HireTrack 360 API running on http://localhost:${PORT}`);
      console.log(`Health: http://127.0.0.1:${PORT}/api/health`);
    });
    if (FRONTEND_PORT && Number(FRONTEND_PORT) !== Number(PORT)) {
      app.listen(FRONTEND_PORT, "0.0.0.0", () => console.log(`HireTrack 360 frontend running on http://localhost:${FRONTEND_PORT}`));
    }
  } catch (error) {
    console.error("Startup error:", error.message);
    process.exit(1);
  }
}
start();
