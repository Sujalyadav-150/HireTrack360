const skillAliases = new Map([
  ["js", "javascript"],
  ["nodejs", "node.js"],
  ["node js", "node.js"],
  ["node", "node.js"],
  ["reactjs", "react"],
  ["react.js", "react"],
  ["react js", "react"],
  ["postgres", "postgresql"],
  ["powerbi", "power bi"],
  ["ms excel", "excel"],
  ["communication", "communication skills"],
  ["problem solving", "problem-solving"]
]);

const matchWeights = { skills: 55, title: 15, experience: 10, education: 10, location: 6, employmentType: 4 };
const freeEmailDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "proton.me", "protonmail.com"]);

function normalizeUserRole(role) {
  return String(role ?? "").trim().toLowerCase().replace(/[_\s-]+/g, "");
}

function normalizeMatchScore(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") {
    for (const candidate of [value.score, value.matchScore, value.value, value.percentage]) {
      const normalized = normalizeMatchScore(candidate);
      if (normalized !== null) return normalized;
    }
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return null;
}

function normalizeSkill(skill) {
  const normalized = String(skill || "").normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
  return skillAliases.get(normalized) || normalized;
}

function expandSkills(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.flatMap(item => String(item || "").split(/[|,;\\n]+/).map(skill => skill.trim()).filter(Boolean));
}

function tokenSet(value) {
  return new Set(normalizeSkill(value).split(/[^a-z0-9+#.]+/).filter(token => token.length > 1));
}

function textSimilarity(first, second) {
  const firstTokens = tokenSet(first);
  const secondTokens = tokenSet(second);
  if (!firstTokens.size || !secondTokens.size) return null;
  const overlap = [...firstTokens].filter(token => secondTokens.has(token)).length;
  return Math.round(overlap / new Set([...firstTokens, ...secondTokens]).size * 100);
}

function yearsIn(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (match) return Number(match[1]);
  const bare = String(value || "").match(/^\s*(\d+(?:\.\d+)?)\s*\+?\s*$/);
  return bare ? Number(bare[1]) : null;
}

function calculateMatch(candidate = {}, job = {}) {
  if (Array.isArray(candidate)) candidate = { skills: candidate };
  if (Array.isArray(job)) job = { requiredSkills: job };
  const candidateSkills = expandSkills(candidate.skills);
  const requiredSkills = expandSkills(job.requiredSkills?.length ? job.requiredSkills : job.skills || []);
  const candidateSet = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
  const requirements = [...new Map(requiredSkills.map(skill => [normalizeSkill(skill), String(skill).trim()])).values()];
  const matchedSkills = requirements.filter(skill => candidateSet.has(normalizeSkill(skill)));
  const missingSkills = requirements.filter(skill => !candidateSet.has(normalizeSkill(skill)));
  const skills = requirements.length ? Math.round(matchedSkills.length / requirements.length * 100) : null;

  const targetRoles = [candidate.targetRole, ...(candidate.preferredTitles || []), ...(candidate.resumeVersions || []).map(resume => resume.targetRole)].filter(Boolean);
  const titleResults = targetRoles.map(role => textSimilarity(role, job.title)).filter(value => value !== null);
  const title = titleResults.length ? Math.max(...titleResults) : null;

  const candidateYears = yearsIn(candidate.experience);
  const requiredYears = yearsIn(job.experience);
  const experience = candidateYears !== null && requiredYears !== null
    ? Math.min(100, Math.round(candidateYears / Math.max(requiredYears, 1) * 100))
    : candidate.experience && job.experience ? textSimilarity(candidate.experience, job.experience) : null;
  const education = candidate.education && job.educationRequirements
    ? (normalizeSkill(candidate.education).includes(normalizeSkill(job.educationRequirements)) || normalizeSkill(job.educationRequirements).includes(normalizeSkill(candidate.education)) ? 100 : textSimilarity(candidate.education, job.educationRequirements))
    : null;

  const preferredLocations = Array.isArray(candidate.preferredLocations) ? candidate.preferredLocations : [];
  const locations = preferredLocations.length ? preferredLocations : candidate.location ? [candidate.location] : [];
  const location = locations.length
    ? (job.remote && candidate.remotePreference === "REMOTE" ? 100
      : locations.some(value => normalizeSkill(value) === normalizeSkill(job.location) || normalizeSkill(job.location).includes(normalizeSkill(value))) ? 100
        : candidate.remotePreference === "ANY" && job.remote ? 100 : 0)
    : null;

  const preferredTypes = (candidate.preferredJobTypes || []).map(normalizeSkill);
  const employmentType = preferredTypes.length
    ? (preferredTypes.includes(normalizeSkill(job.employmentType)) || (job.remote && preferredTypes.includes("remote")) ? 100 : 0)
    : null;

  const components = { skills, title, experience, education, location, employmentType };
  const activeWeight = Object.entries(components).reduce((sum, [key, value]) => sum + (value === null ? 0 : matchWeights[key]), 0);
  const score = activeWeight
    ? Math.round(Object.entries(components).reduce((sum, [key, value]) => sum + (value === null ? 0 : value * matchWeights[key]), 0) / activeWeight)
    : 0;
  const explanations = [];
  if (skills !== null) explanations.push(`${matchedSkills.length}/${requirements.length} required skills matched`);
  if (title !== null) explanations.push(`Title relevance ${title}%`);
  if (experience !== null) explanations.push(`Experience match ${experience}%`);
  if (education !== null) explanations.push(`Education match ${education}%`);
  if (location !== null) explanations.push(`Location preference ${location === 100 ? "matched" : "not matched"}`);
  if (employmentType !== null) explanations.push(`Job type preference ${employmentType === 100 ? "matched" : "not matched"}`);
  return {
    score,
    components,
    matchedSkills,
    missingSkills,
    explanations,
    formula: "Weighted average: skills 55%, title 15%, experience 10%, education 10%, location 6%, job type 4%. Unavailable dimensions are excluded and remaining weights normalized."
  };
}

function calculateJobRisk(job, recruiter = {}) {
  let riskScore = 0;
  const positiveSignals = [];
  const warnings = [];
  const evidence = [];
  const website = String(recruiter.companyWebsite || "").trim();
  const description = `${job.title || ""} ${job.description || ""} ${(job.responsibilities || []).join(" ")}`;
  const requiredSkills = job.requiredSkills?.length ? job.requiredSkills : job.skills || [];
  const addWarning = (points, warning, detail = warning) => {
    riskScore += points;
    warnings.push(warning);
    evidence.push({ code: warning.toLowerCase().replace(/[^a-z0-9]+/g, "_"), points, detail });
  };
  const companyHost = (() => {
    try { return new URL(website).hostname.replace(/^www\./, "").toLowerCase(); }
    catch { return ""; }
  })();

  if (String(job.company || "").trim()) positiveSignals.push("Company name provided");
  else addWarning(22, "Missing company information");
  if (companyHost) positiveSignals.push("Company website available");
  else addWarning(10, "Company website is missing");
  if (recruiter.companyName && recruiter.companyDescription?.trim().length >= 80) positiveSignals.push("Complete company profile");
  else addWarning(10, "Company or recruiter profile is incomplete");
  if (String(job.description || "").trim().length >= 300) positiveSignals.push("Professional, detailed job description");
  else if (String(job.description || "").trim().length >= 100) addWarning(5, "Job description could be more detailed");
  else addWarning(12, "Job description is very short or missing");
  if (requiredSkills.length) positiveSignals.push("Required skills are listed");
  else addWarning(8, "Required skills are missing");

  const salaryMin = Number(job.salaryMin);
  const salaryMax = Number(job.salaryMax);
  if (salaryMin > 0 && salaryMax >= salaryMin) {
    positiveSignals.push("Salary range is specified");
    if (salaryMax > 20000000 || salaryMax > salaryMin * 5) addWarning(18, "Salary range is unusually high or wide");
    if (/₹\s*2\s*lakh\s*(?:per\s*month|\/\s*month)|2\s*lakh\s*(?:per\s*month|\/\s*month)|no experience.{0,80}(?:lakh|crore)/i.test(description)) {
      addWarning(18, "Compensation appears unrealistic for the stated experience");
    }
  } else addWarning(5, "Salary range is missing or invalid");

  const contactEmail = String(job.contactEmail || recruiter.email || "").trim().toLowerCase();
  const emailDomain = contactEmail.split("@")[1] || "";
  if (!contactEmail) addWarning(8, "Recruiter contact information is missing");
  else if (freeEmailDomains.has(emailDomain)) addWarning(8, "Recruiter contact uses a public email domain");
  else if (companyHost && emailDomain === companyHost) positiveSignals.push("Recruiter email matches company domain");
  else if (companyHost && emailDomain !== companyHost) addWarning(12, "Recruiter email does not match the company website domain");

  if (/(registration|application|processing|security|training)\s+(?:fee|payment|deposit)|pay\s+(?:a\s+)?(?:fee|₹|rs\.?|inr)|send\s+(?:money|payment)|upfront\s+payment/i.test(description)) {
    addWarning(40, "Payment requested from candidates", "Detected a registration, application, training, or upfront payment request");
  }
  if (/(bank\s+(?:account|details|information)|account\s+number|card\s+number|cvv|upi\s+id|send\s+(?:your\s+)?(?:aadhaar|passport|pan\s+card)|share\s+(?:your\s+)?otp)/i.test(description)) {
    addWarning(30, "Sensitive banking or identity information requested");
  }
  if (/(telegram|t\.me\/|whatsapp|wa\.me\/)/i.test(description) && /(only|exclusively|contact|message|chat|apply)/i.test(description)) {
    addWarning(25, "Communication relies on Telegram or WhatsApp");
  }

  const links = [...(job.externalLinks || [])];
  for (const match of description.matchAll(/https?:\/\/[^\s<>()]+/gi)) links.push(match[0].replace(/[.,;!?]+$/, ""));
  for (const link of links) {
    try {
      const host = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
      if (["t.me", "telegram.me", "wa.me", "bit.ly", "tinyurl.com", "cutt.ly", "is.gd"].includes(host)) {
        addWarning(24, "Suspicious external link", `Link uses ${host}`);
      } else if (companyHost && host !== companyHost && !host.endsWith(`.${companyHost}`)) {
        addWarning(8, "External link does not match company domain", `Link uses ${host}`);
      }
    } catch {
      addWarning(12, "Malformed external link detected");
    }
  }

  riskScore = Math.max(0, Math.min(100, riskScore));
  const riskLevel = riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "REVIEW" : "LOW";
  return {
    riskScore,
    riskLevel,
    status: riskLevel === "HIGH" ? "POTENTIALLY SUSPICIOUS" : riskLevel === "REVIEW" ? "REVIEW CAREFULLY" : "LOW RISK",
    positiveSignals,
    warnings,
    evidence,
    recommendation: riskLevel === "HIGH" ? "Avoid applying until the employer is independently verified." : riskLevel === "REVIEW" ? "Verify the employer before sharing sensitive information." : "No high-risk indicators detected; independently verify the employer.",
    disclaimer: "This rule-based risk assessment uses available listing information; it cannot guarantee that a job is genuine or fake."
  };
}

function calculateTrust(job, recruiter) {
  const risk = calculateJobRisk(job, recruiter);
  return {
    ...risk,
    score: 100 - risk.riskScore,
    trustSignals: risk.positiveSignals,
    trustWarnings: risk.warnings,
    label: risk.riskLevel === "LOW" ? "Lower Risk / Strong Trust Signals" : risk.riskLevel === "REVIEW" ? "Review Carefully" : "Potentially Suspicious"
  };
}

module.exports = { calculateMatch, calculateTrust, calculateJobRisk, normalizeSkill, normalizeMatchScore, normalizeUserRole };