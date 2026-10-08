require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Interview = require("../models/Interview");
const Notification = require("../models/Notification");
const ActivityLog = require("../models/ActivityLog");
const { calculateTrust, calculateMatch } = require("../utils/scoring");

const demoPassword = process.env.DEMO_PASSWORD || "HireTrackDemo123!";

async function upsertDemoUser(values) {
  const existing = await User.findOne({ email: values.email });
  if (existing) return existing;
  return User.create({ ...values, password: await bcrypt.hash(demoPassword, 12) });
}

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required to seed demo data");
  await mongoose.connect(process.env.MONGODB_URI);
  const seeker = await upsertDemoUser({
    name: "Avery Morgan",
    email: "seeker@example.com",
    role: "jobseeker",
    authProvider: "local",
    skills: ["SQL", "Excel", "Power BI", "Python"],
    location: "Bengaluru",
    experience: "2 years in data analytics",
    education: "BSc Statistics"
  });
  const recruiter = await upsertDemoUser({
    name: "Jordan Lee",
    email: "recruiter@example.com",
    role: "recruiter",
    authProvider: "local",
    companyName: "Northstar Labs",
    designation: "Talent Partner",
    companyWebsite: "https://example.com",
    companyLocation: "Bengaluru",
    companyDescription: "Northstar Labs builds practical software products for growing teams and modern workplaces."
  });

  const jobDefinitions = [
    { title: "Data Analyst", location: "Bengaluru", employmentType: "Hybrid", remote: false, salaryMin: 900000, salaryMax: 1400000, requiredSkills: ["SQL", "Excel", "Power BI", "Python", "AWS"], description: "Join the analytics team to build reliable reporting, investigate product trends, and partner with teams across the business. You will design data models, define key metrics, and communicate useful findings to stakeholders.", responsibilities: ["Build trusted reporting", "Investigate product trends", "Share clear recommendations"], experience: "2+ years" },
    { title: "Business Intelligence Analyst", location: "Remote", employmentType: "Full-time", remote: true, salaryMin: 1000000, salaryMax: 1600000, requiredSkills: ["SQL", "Power BI", "Data modeling"], description: "Help product and operations teams understand performance through well-designed data models, dashboards, and clear analysis. Work with stakeholders to make sure reporting answers the right questions.", responsibilities: ["Develop dashboards", "Maintain data models", "Partner with stakeholders"], experience: "3+ years" },
    { title: "Product Data Analyst", location: "Mumbai", employmentType: "Full-time", remote: false, salaryMin: 1100000, salaryMax: 1700000, requiredSkills: ["SQL", "Python", "Experimentation"], description: "Measure product outcomes and help teams run thoughtful experiments. Translate complex data into concise insights that inform the product roadmap.", responsibilities: ["Analyze feature usage", "Support experiments", "Present findings"], experience: "2+ years" }
  ];

  const jobs = [];
  for (const definition of jobDefinitions) {
    const trust = calculateTrust({ ...definition, company: recruiter.companyName }, recruiter);
    const job = await Job.findOneAndUpdate(
      { recruiterId: recruiter._id, title: definition.title },
      { $setOnInsert: { ...definition, company: recruiter.companyName, recruiterId: recruiter._id, trustScore: trust.score, trustSignals: trust.trustSignals, trustWarnings: trust.trustWarnings, status: "OPEN" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    jobs.push(job);
  }

  let application = await Application.findOne({ candidateId: seeker._id, jobId: jobs[0]._id });
  if (!application) {
    const match = calculateMatch(seeker.skills, jobs[0].requiredSkills);
    application = await Application.create({
      candidateId: seeker._id,
      jobId: jobs[0]._id,
      status: "SCREENING",
      matchScore: match.score,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      statusHistory: [{ status: "APPLIED", changedAt: new Date(Date.now() - 10 * 86400000), changedBy: seeker._id }, { status: "SCREENING", changedAt: new Date(Date.now() - 4 * 86400000), changedBy: recruiter._id }],
      createdAt: new Date(Date.now() - 10 * 86400000),
      lastUpdated: new Date(Date.now() - 4 * 86400000),
      lastUpdatedAt: new Date(Date.now() - 4 * 86400000)
    });
  }
  if (!(await Interview.exists({ applicationId: application._id }))) {
    await Interview.create({
      applicationId: application._id,
      jobId: jobs[0]._id,
      candidateId: seeker._id,
      recruiterId: recruiter._id,
      scheduledAt: new Date(Date.now() + 3 * 86400000),
      interviewType: "VIDEO",
      meetingLink: "https://example.com/meeting",
      notes: "Demo interview record"
    });
  }
  await Notification.updateOne(
    { dedupeKey: `seed-welcome-${seeker._id}` },
    { $setOnInsert: { userId: seeker._id, type: "WELCOME", title: "Welcome to HireTrack 360", message: "Your profile is ready. Explore matching jobs and track your applications here.", link: "/dashboard.html", dedupeKey: `seed-welcome-${seeker._id}` } },
    { upsert: true }
  );
  if (!(await ActivityLog.exists({ actor: recruiter._id, action: "JOB_CREATED", entityId: jobs[0]._id }))) {
    await ActivityLog.create({ actor: recruiter._id, action: "JOB_CREATED", entityType: "Job", entityId: jobs[0]._id, metadata: { title: jobs[0].title, source: "seed" } });
  }
  console.log("HireTrack 360 demo data is ready.");
  console.log("Job Seeker: seeker@example.com");
  console.log("Recruiter: recruiter@example.com");
  console.log(`Demo password: ${demoPassword}`);
}

seed().catch(error => {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
