const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateMatch, calculateTrust, calculateJobRisk } = require("../utils/scoring");

test("match score is derived from normalized required skills", () => {
  const result = calculateMatch([" JS ", "PowerBI", "SQL"], ["JavaScript", "Power BI", "AWS", "SQL"]);
  assert.equal(result.score, 75);
  assert.deepEqual(result.matchedSkills, ["JavaScript", "Power BI", "SQL"]);
  assert.deepEqual(result.missingSkills, ["AWS"]);
});

test("empty requirements do not imply a perfect match", () => {
  assert.equal(calculateMatch(["SQL"], []).score, 0);
});

test("profile-aware match changes with title, experience, education, location, and job type", () => {
  const candidate = {
    skills: ["SQL", "Excel", "Power BI", "Python"],
    targetRole: "Data Analyst",
    experience: "5 years in analytics",
    education: "Bachelor of Science in Statistics",
    location: "Pune",
    preferredLocations: ["Pune"],
    preferredJobTypes: ["Full-time"]
  };
  const strong = calculateMatch(candidate, {
    title: "Data Analyst",
    requiredSkills: ["SQL", "Excel", "Power BI", "Python"],
    experience: "2+ years",
    educationRequirements: "Statistics",
    location: "Pune",
    employmentType: "Full-time"
  });
  const weak = calculateMatch(candidate, {
    title: "Senior Java Developer",
    requiredSkills: ["Java", "Spring Boot", "Kubernetes", "AWS"],
    experience: "8+ years",
    educationRequirements: "Computer Science",
    location: "London",
    employmentType: "Contract"
  });
  assert.ok(strong.score > 85);
  assert.ok(weak.score < strong.score);
  assert.equal(strong.components.education, 100);
  assert.equal(strong.components.location, 100);
  assert.equal(weak.missingSkills.length, 4);
});

test("trust score explains missing listing details and includes disclaimer", () => {
  const result = calculateTrust({ company: "Example Co", description: "Short description" }, { isActive: true });
  assert.equal(result.score < 60, true);
  assert.equal(result.trustWarnings.some(warning => warning.includes("website")), true);
  assert.match(result.disclaimer, /cannot guarantee/);
});

test("complete listing scores strong only when company and recruiter signals exist", () => {
  const result = calculateTrust({
    company: "Example Co",
    contactEmail: "jobs@example.com",
    description: "A detailed job description ".repeat(20),
    requiredSkills: ["Node.js", "MongoDB"],
    salaryMin: 80000,
    salaryMax: 120000
  }, {
    isActive: true,
    companyName: "Example Co",
    companyWebsite: "https://example.com",
    companyDescription: "We build useful software products for our customers, partners, and growing teams around the world."
  });
  assert.equal(result.score, 100);
  assert.equal(result.label, "Lower Risk / Strong Trust Signals");
});

test("job risk detects payment, banking, messaging-only, and suspicious-link indicators", () => {
  const result = calculateJobRisk({
    title: "Work from home, no experience",
    company: "",
    description: "Earn ₹2 lakh per month with no experience. Pay ₹5,000 registration fee. Send bank details immediately. Contact only through Telegram https://t.me/apply-now",
    requiredSkills: [],
    externalLinks: ["https://bit.ly/apply-now"]
  }, {});
  assert.ok(result.riskScore >= 80);
  assert.equal(result.riskLevel, "HIGH");
  assert.ok(result.warnings.some(warning => warning.includes("Payment")));
  assert.ok(result.warnings.some(warning => warning.includes("banking")));
  assert.ok(result.warnings.some(warning => warning.includes("Telegram")));
  assert.match(result.disclaimer, /cannot guarantee/);
});
