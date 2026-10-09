(async function initializeJobseekerDashboard() {
  let authenticatedUser;
  try {
    const session = await window.apiRequest("/auth/me");
    authenticatedUser = session.user;
  } catch {
    localStorage.removeItem("hiretrack_token");
    window.location.href = "login.html";
    return;
  }
  if (authenticatedUser.role === "recruiter") {
    window.location.href = "recruiter-dashboard.html";
    return;
  }
  if (authenticatedUser.role !== "jobseeker") {
    localStorage.removeItem("hiretrack_token");
    window.location.href = "login.html";
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.error);
  }

let jobs = [];
let recommendedJobs = [];
let savedJobIds = [];
let savedJobs = [];
let applications = [];
let resumes = [];
let interviews = [];
let notifications = [];
let unreadNotificationCount = 0;
let staleApplicationIds = [];
let analyticsData = null;
let jobPagination = { page: 1, pages: 1, total: 0 };
let jobFilters = {};
let selectedJobDetails = null;
let selectedJobMatch = null;
let profile = {
  name: authenticatedUser.name,
  email: authenticatedUser.email,
  role: authenticatedUser.role
};
let candidateSkills = authenticatedUser.skills || [];
let currentView = window.location.hash.slice(1) || "overview";
let toastTimer;

const overviewView = document.getElementById("overviewView");
const contentView = document.getElementById("contentView");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const viewDetails = {
  overview: ["Good evening", "Here is what is happening with your job search."],
  "find-jobs": ["Find jobs", "Explore roles selected for your skills."],
  "recommended-jobs": ["Recommended jobs", "Roles matched to your profile and skills."],
  "job-details": ["Job details", "Review match and trust signals before you apply."],
  applications: ["Applications", "Track progress and follow-up dates."],
  "saved-jobs": ["Saved jobs", "Your bookmarked opportunities."],
  "career-gaps": ["Career gaps", "Skills that could improve your match score."],
  resumes: ["Resumes", "Keep your resume versions together."],
  profile: ["My resume and profile", "Manage the details employers see."],
  interviews: ["Interviews", "Prepare for upcoming conversations."],
  settings: ["Settings", "Manage your profile and preferences."],
  notifications: ["Notifications", "Recent activity from your job search."],
  trust: ["Trust signals", "Review the signals behind job trust scores."],
  analytics: ["Application analytics", "A closer look at your application funnel."]
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function normalizeMatchScore(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") {
    const nestedValue = value.score ?? value.matchScore ?? value.value ?? value.percentage;
    return normalizeMatchScore(nestedValue);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return null;
}

function formatMatchPercent(value) {
  const numericValue = normalizeMatchScore(value);
  if (numericValue === null) return "—";
  return `${Math.round(Math.max(0, Math.min(100, Number(numericValue))))}%`;
}

function showToast(message) {
  const toast = document.getElementById("dashboardToast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2800);
}

function jobCard(job, options = {}) {
  const jobId = job._id || job.id;
  const matchScore = normalizeMatchScore(job.matchScore ?? job.match?.score ?? null);
  const matchLabel = matchScore === null ? "—" : `${Math.round(Math.max(0, Math.min(100, matchScore)))}%`;
  return `<article class="view-card job-result">
    <div class="view-card-head"><div><span class="section-kicker">${matchLabel} MATCH</span><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p></div><span class="match-pill">${escapeHtml(job.type)}</span></div>
    <div class="chips"><span>${escapeHtml(job.pay)}</span><span>${escapeHtml(job.skills)}</span></div>
    <div class="view-card-actions"><button class="btn btn-ghost" data-action="view-job" data-job-id="${escapeHtml(jobId)}">Details</button>${options.remove ? `<button class="btn btn-ghost" data-action="remove-saved" data-job-id="${escapeHtml(jobId)}">Remove</button>` : `<button class="btn btn-ghost" data-action="save-job" data-job-id="${escapeHtml(jobId)}">${savedJobIds.includes(jobId) ? "Saved" : "Save job"}</button>`}<button class="btn btn-primary" data-action="apply-job" data-job-id="${escapeHtml(jobId)}">Apply</button></div>
  </article>`;
}

function renderJobs() {
  return `<form id="jobFilters" class="job-filters"><label>Keyword<input name="q" type="search" value="${escapeHtml(jobFilters.q || "")}" placeholder="Title, company, skill"></label><label>Location<input name="location" value="${escapeHtml(jobFilters.location || "")}" placeholder="City or remote"></label><label>Employment type<select name="type"><option value="">Any type</option>${["Full-time", "Part-time", "Contract", "Internship", "Hybrid", "Remote"].map(type => `<option ${jobFilters.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label><label>Skills<input name="skills" value="${escapeHtml(jobFilters.skills || "")}" placeholder="SQL, Python"></label><label>Experience<input name="experience" value="${escapeHtml(jobFilters.experience || "")}" placeholder="e.g. 2+ years"></label><label>Minimum salary<input name="salaryMin" type="number" min="0" value="${escapeHtml(jobFilters.salaryMin || "")}"></label><label>Date posted<select name="postedWithin"><option value="">Any time</option><option value="1" ${jobFilters.postedWithin === "1" ? "selected" : ""}>24 hours</option><option value="7" ${jobFilters.postedWithin === "7" ? "selected" : ""}>7 days</option><option value="30" ${jobFilters.postedWithin === "30" ? "selected" : ""}>30 days</option><option value="90" ${jobFilters.postedWithin === "90" ? "selected" : ""}>90 days</option></select></label><label class="toggle-row"><input name="remote" type="checkbox" ${jobFilters.remote ? "checked" : ""}> Remote</label><button class="btn btn-primary" type="submit">Search jobs</button></form>
    <div class="view-toolbar"><p>${jobPagination.total} open roles · Page ${jobPagination.page} of ${Math.max(jobPagination.pages, 1)}</p></div><div class="view-list" id="jobResults">${jobs.length ? jobs.map(job => jobCard(job)).join("") : `<div class="view-card empty-state"><h3>No open jobs found</h3><p>Try changing your search filters.</p></div>`}</div><div class="pagination-controls"><button class="btn btn-ghost" data-action="jobs-previous" ${jobPagination.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${jobPagination.page} / ${Math.max(jobPagination.pages, 1)}</span><button class="btn btn-ghost" data-action="jobs-next" ${jobPagination.page >= jobPagination.pages ? "disabled" : ""}>Next</button></div>`;
}

function renderRecommendedJobs() {
  return `<div class="view-toolbar"><p>Ranked using your skills, target role, experience, education, location, and job-type preferences.</p><span class="match-pill">${recommendedJobs.length} ranked jobs</span></div><div class="view-list">${recommendedJobs.map(job => jobCard(job)).join("") || `<div class="view-card empty-state"><h3>No recommendations yet</h3><p>Complete your profile or check again when matching jobs are posted.</p></div>`}</div>`;
}

function renderApplications() {
  return `<div class="view-toolbar"><p>${applications.length} tracked applications</p><span class="match-pill">Your applications</span></div>
    <div class="view-list">${applications.length ? applications.map(application => `<article class="view-card application-row"><div><span class="section-kicker">${escapeHtml(application.needsFollowUp ? "NEEDS FOLLOW-UP" : application.status)}</span><h3>${escapeHtml(application.title)}</h3><p>${escapeHtml(application.company)} · Applied ${escapeHtml(application.appliedAt)}</p>${application.needsFollowUp ? `<p class="follow-up-note">No meaningful update for at least 7 days. Consider following up with the recruiter.</p>` : ""}<div class="application-timeline">${application.statusHistory.map(stage => `<span class="${stage.status === application.status ? "current" : ""}">${escapeHtml(applicationStatus(stage.status))}<small>${new Date(stage.changedAt).toLocaleDateString()}</small></span>`).join("")}</div></div><span class="match-pill">${escapeHtml(application.status)}</span></article>`).join("") : `<div class="view-card empty-state"><h3>No applications yet</h3><p>Apply to an open job and its status will appear here.</p><button class="btn btn-primary" data-view-link="find-jobs">Find jobs</button></div>`}</div>`;
}

function renderSavedJobs() {
  return savedJobs.length
    ? `<div class="view-list">${savedJobs.map(job => jobCard(job, { remove: true })).join("")}</div>`
    : `<div class="view-card empty-state"><span class="empty-icon">★</span><h3>No saved jobs yet</h3><p>Save a role from Find Jobs and it will be waiting here.</p><button class="btn btn-primary" data-view-link="find-jobs">Browse jobs</button></div>`;
}

function renderCareerGaps() {
  // Display only actual missing skills returned by the backend for open jobs.
  const skillMap = new Map();
  for (const job of jobs) {
    for (const item of Array.isArray(job.missingSkills) ? job.missingSkills : []) {
      const label = String(item || "").trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase().replace(/\s+/g, " ");
      if (!skillMap.has(key)) skillMap.set(key, label);
    }
  }
  const missing = [...skillMap.values()].slice(0, 12);
  const profileSkills = Array.isArray(candidateSkills) ? candidateSkills.filter(Boolean) : [];
  return `<article class="view-card skill-gap-card">
      <span class="section-kicker">SKILL GAPS FROM OPEN JOBS</span>
      <h3>${missing.length ? "Skills to consider building" : "No skill gaps detected"}</h3>
      <p>These are skills required by currently open jobs that are not in your saved profile skills. Update your profile with accurate skills to improve job matching.</p>
      ${missing.length ? `<div class="skill-chip-list">${missing.map(skill => `<span class="skill-chip">${escapeHtml(skill)}</span>`).join("")}</div>` : `<p class="empty-inline">No missing skills were returned for the current open jobs.</p>`}
    </article>
    <article class="view-card">
      <span class="section-kicker">YOUR PROFILE SKILLS</span>
      ${profileSkills.length ? `<div class="skill-chip-list">${profileSkills.map(skill => `<span class="skill-chip">${escapeHtml(skill)}</span>`).join("")}</div>` : `<p class="empty-inline">No profile skills yet. Add them in My Resume / Profile to get useful comparisons.</p>`}
    </article>`;
}

function renderResumes() {
  const resumeRows = resumes.length ? resumes.map(resume => `<article class="view-card compact-row"><div><span class="section-kicker">${escapeHtml(resume.targetRole || "RESUME")}</span><h3>${escapeHtml(resume.name)}</h3><p>${escapeHtml(resume.fileName)} · Added ${new Date(resume.uploadedAt).toLocaleDateString()}</p><div class="view-card-actions"><a href="/api/resumes/${encodeURIComponent(resume.id)}/view" target="_blank" rel="noopener noreferrer">View resume</a><a href="/api/resumes/${encodeURIComponent(resume.id)}/download">Download</a></div><p><strong>Extracted skills:</strong> ${resume.extractedSkills?.length ? resume.extractedSkills.map(escapeHtml).join(", ") : escapeHtml(resume.extractionMessage || "No skills extracted yet")}</p></div><button class="btn btn-ghost" data-action="remove-resume" data-resume-id="${escapeHtml(resume.id)}">Remove</button></article>`).join("") : `<div class="view-card empty-state"><h3>No resumes added</h3><p>Upload a PDF, DOC, or DOCX file to keep a private version in your profile.</p></div>`;
  return `<form id="resumeForm" class="view-card upload-form"><label>Resume name<input name="name" maxlength="100" placeholder="Data Analyst Resume"></label><label>Target role<input name="targetRole" maxlength="100" placeholder="Data Analyst"></label><label for="resumeFile">Resume file (PDF, DOC, DOCX; max 5 MB)</label><input id="resumeFile" name="resume" type="file" accept=".pdf,.doc,.docx" required><button class="btn btn-primary" type="submit">Upload resume</button></form><div class="view-list">${resumeRows}</div>`;
}

function renderInterviews() {
  const interviewRows = interviews.length ? interviews.map(interview => `<article class="view-card compact-row"><div><span class="section-kicker">${new Date(interview.scheduledAt).toLocaleString()}</span><h3>${escapeHtml(interview.jobId?.title || "Interview")}</h3><p>${escapeHtml(interview.jobId?.company || "Company")} · ${escapeHtml(interview.interviewType)} · ${escapeHtml(interview.status)}</p>${interview.meetingLink ? `<a href="${escapeHtml(interview.meetingLink)}" target="_blank" rel="noopener noreferrer">Meeting link</a>` : ""}</div><span class="match-pill">${escapeHtml(interview.status)}</span></article>`).join("") : `<div class="view-card empty-state"><h3>No upcoming interviews</h3><p>When a recruiter schedules an interview, it will appear here.</p></div>`;
  return `<div class="view-list">${interviewRows}</div>`;
}

function renderProfile() {
  return `${renderResumes()}<form id="settingsForm" class="view-card view-form"><h3>Candidate profile</h3><label>Display name<input name="name" required value="${escapeHtml(profile.name)}"></label><label>Email<input name="email" type="email" value="${escapeHtml(profile.email)}" disabled></label><label>Phone<input name="phone" value="${escapeHtml(profile.phone || "")}"></label><label>Location<input name="location" value="${escapeHtml(profile.location || "")}"></label><label>Skills<input name="skills" value="${escapeHtml(candidateSkills.join(", "))}" placeholder="SQL, Python"></label><label>Experience<input name="experience" value="${escapeHtml(profile.experience || "")}"></label><label>Education<input name="education" value="${escapeHtml(profile.education || "")}"></label><label>Bio<textarea name="bio" rows="4">${escapeHtml(profile.bio || "")}</textarea></label><div class="account-role">Account type <strong>Job Seeker</strong></div><button class="btn btn-primary" type="submit">Save profile</button></form>`;
}

function renderNotifications() {
  return `<div class="view-toolbar"><p>${unreadNotificationCount} unread notifications</p><button class="btn btn-dark" data-action="mark-all-read">Mark all as read</button></div><div class="view-list">${notifications.length ? notifications.map(notification => `<article class="view-card notification-row ${notification.read ? "read" : "unread"}"><div><span class="section-kicker">${escapeHtml(notification.type.replaceAll("_", " "))} · ${new Date(notification.createdAt).toLocaleString()}</span><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p></div><div class="view-card-actions"><a class="btn btn-ghost" href="${escapeHtml(notification.link)}">Open</a>${notification.read ? "" : `<button class="btn btn-dark" data-action="mark-read" data-notification-id="${escapeHtml(notification._id)}">Mark read</button>`}</div></article>`).join("") : `<div class="view-card empty-state"><h3>You are all caught up</h3><p>Application updates and interview reminders will appear here.</p></div>`}</div><section class="view-card push-settings"><div><span class="section-kicker">BROWSER ALERTS</span><h3>Push notifications</h3><p>Enable browser permission to receive time-sensitive updates.</p></div><button class="btn btn-primary" data-action="enable-push">Enable notifications</button><button class="btn btn-ghost" data-action="test-push">Send test notification</button></section>`;
}

function renderTrust() {
  if (!selectedJobDetails) return `<div class="view-card empty-state"><h3>Choose a job to review</h3><p>Open job details to see its trust score and the signals behind it.</p><button class="btn btn-primary" data-view-link="find-jobs">Find jobs</button></div>`;
  const safety = selectedJobDetails.safety || {};
  const level = String(safety.riskLevel || "REVIEW").toLowerCase();
  const positiveSignals = Array.isArray(safety.positiveSignals) ? safety.positiveSignals : [];
  const warnings = Array.isArray(safety.warnings) ? safety.warnings : [];
  const evidence = Array.isArray(safety.evidence) ? safety.evidence : [];
  return `<article class="view-card safety-card risk-${escapeHtml(level)}"><span class="section-kicker">JOB SAFETY CHECK · HEURISTIC RISK ASSESSMENT</span><h3>Risk level: ${escapeHtml(safety.riskLevel || "REVIEW")}</h3><strong class="risk-score">${Math.max(0, Math.min(100, Number(safety.riskScore) || 0))}/100 risk</strong><p>${escapeHtml(safety.disclaimer || "This is an automated screening aid, not proof that a job is genuine or fraudulent.")}</p><section class="trust-signals"><b>Positive signals (${positiveSignals.length})</b><div class="signal-list">${positiveSignals.map(signal => `<span>✓ ${escapeHtml(signal)}</span>`).join("") || `<span>No positive signals recorded</span>`}</div></section><section class="trust-warnings"><b>Warnings (${warnings.length})</b><div class="signal-list">${warnings.map((warning, index) => `<span>⚠ ${escapeHtml(warning)}${evidence[index]?.detail && evidence[index].detail !== warning ? ` — ${escapeHtml(evidence[index].detail)}` : ""}</span>`).join("") || `<span>No known warning indicators detected; still verify independently.</span>`}</div></section><p><strong>Recommendation:</strong> ${escapeHtml(safety.recommendation || "Verify the employer and job details independently before sharing sensitive information.")}</p><p class="formula-note">Risk points come from observable listing signals such as missing details, public contact domains, unusual payment requests, or suspicious links. A warning is not a fraud verdict.</p></article>`;
}
function renderAnalytics() {
  if (!analyticsData) return `<div class="view-card empty-state"><h3>Loading your analytics</h3><p>Application metrics use your saved application records.</p></div>`;
  const entries = [["Applied", analyticsData.counts.APPLIED], ["Under review", analyticsData.counts.SCREENING], ["Shortlisted", analyticsData.counts.SHORTLISTED], ["Interviews", analyticsData.counts.INTERVIEW], ["Offers", analyticsData.counts.OFFERED], ["Accepted", analyticsData.counts.ACCEPTED], ["Rejected", analyticsData.counts.REJECTED]];
  const maximum = Math.max(...entries.map(([, count]) => count), 1);
  return `<div class="view-card analytics-list">${entries.map(([stage, count]) => `<div class="analytics-row"><span>${stage}</span><div><i style="width:${Math.max(count / maximum * 100, count ? 8 : 0)}%"></i></div><strong>${count}</strong></div>`).join("")}</div><div class="view-card analytics-summary"><strong>${analyticsData.interviewConversionRate}%</strong><span>Interview conversion</span><strong>${analyticsData.offerConversionRate}%</strong><span>Offer conversion</span><strong>${analyticsData.staleApplications}</strong><span>Needs follow-up</span></div>`;
}

function renderJobDetails() {
  if (!selectedJobDetails) return `<div class="view-card empty-state"><h3>Job details unavailable</h3><button class="btn btn-primary" data-view-link="find-jobs">Back to jobs</button></div>`;
  const { job, safety } = selectedJobDetails;
  const match = selectedJobMatch || { score: 0, matchedSkills: [], missingSkills: [], explanations: [], components: {}, formula: "" };
  const normalizedMatch = { ...match, score: normalizeMatchScore(match.score ?? 0) ?? 0 };
  const components = Object.entries(normalizedMatch.components || {}).filter(([, score]) => score !== null && score !== undefined);
  const matchLabel = formatMatchPercent(normalizedMatch.score);
  return `<article class="view-card job-detail-card"><div class="view-card-head"><div><span class="section-kicker">${escapeHtml(job.employmentType || "Full-time")} · ${job.remote ? "Remote" : escapeHtml(job.location || "On-site")}</span><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} · ${escapeHtml(job.location || "Location not listed")}</p></div><span class="match-pill">${matchLabel} match</span></div><div class="job-detail-facts"><span>Posted ${new Date(job.createdAt).toLocaleDateString()}</span><span>Experience ${escapeHtml(job.experience || "Not specified")}</span><span>Education ${escapeHtml(job.educationRequirements || "Not specified")}</span><span>Salary ${job.salaryMin || job.salaryMax ? `${job.salaryMin || "-"} to ${job.salaryMax || "-"}` : "Not listed"}</span><span>Deadline ${job.deadline ? new Date(job.deadline).toLocaleDateString() : "Not specified"}</span></div><h4>Why this job matches you</h4><p>Weighted match score: ${matchLabel}</p><div class="analytics-list">${components.map(([name, score]) => `<div class="analytics-row"><span>${escapeHtml(name)}</span><div><i style="width:${Math.max(0, Math.min(100, Number(score || 0)))}%"></i></div><strong>${formatMatchPercent(score)}</strong></div>`).join("")}</div><ul class="match-explanations">${(normalizedMatch.explanations || []).map(reason => `<li>✓ ${escapeHtml(reason)}</li>`).join("")}</ul><div class="skill-breakdown"><div><b>Matched skills</b>${(normalizedMatch.matchedSkills || []).map(skill => `<span>✓ ${escapeHtml(skill)}</span>`).join("") || "No required skills listed"}</div><div><b>Missing skills</b>${(normalizedMatch.missingSkills || []).map(skill => `<span>• ${escapeHtml(skill)}</span>`).join("") || "None"}</div></div><p class="formula-note">Formula: ${escapeHtml(normalizedMatch.formula || "Weighted job-fit scoring")}. This is a profile-fit estimate, not a hiring probability.</p><section class="view-card safety-card risk-${safety.riskLevel.toLowerCase()}"><span class="section-kicker">JOB SAFETY CHECK · RISK ASSESSMENT</span><h4>Risk level: ${escapeHtml(safety.riskLevel)} · ${safety.riskScore}/100</h4><p>${escapeHtml(safety.disclaimer)}</p><div class="trust-signals"><b>Positive signals</b>${safety.positiveSignals.map(signal => `<span>✓ ${escapeHtml(signal)}</span>`).join("") || "None detected"}</div><div class="trust-warnings"><b>Warnings</b>${safety.warnings.map(warning => `<span>⚠ ${escapeHtml(warning)}</span>`).join("") || "None detected"}</div><p><strong>Recommendation:</strong> ${escapeHtml(safety.recommendation)}</p></section><h4>Job description</h4><p>${escapeHtml(job.description || "No description provided")}</p><h4>Responsibilities</h4><div class="chips">${(job.responsibilities || []).map(item => `<span>${escapeHtml(item)}</span>`).join("") || "Not listed"}</div><div class="view-card-actions"><label>Resume<select id="applyResume"><option value="">No resume attached</option>${resumes.map(resume => `<option value="${escapeHtml(resume._id)}">${escapeHtml(resume.name)}</option>`).join("")}</select></label><button class="btn btn-primary" data-action="apply-job" data-job-id="${escapeHtml(job._id)}">Apply for this job</button></div></article>`;
}

function normalizeJob(job) {
  const match = job.match || { score: job.matchScore ?? null, components: {}, matchedSkills: [], missingSkills: [], explanations: [] };
  const normalizedMatchScore = normalizeMatchScore(job.matchScore ?? match.score ?? null);
  const salary = job.salaryMin || job.salaryMax
    ? `${job.salaryMin ? `INR ${job.salaryMin}` : "Salary"}${job.salaryMax ? `-${job.salaryMax}` : "+"}`
    : "Salary not listed";
  return {
    ...job,
    id: String(job._id),
    title: job.title,
    company: job.company,
    location: job.location || "Location not listed",
    pay: salary,
    type: job.employmentType || "Full-time",
    match: {
      ...match,
      score: normalizedMatchScore ?? 0,
      components: match.components || {},
      matchedSkills: match.matchedSkills || [],
      missingSkills: match.missingSkills || [],
      explanations: match.explanations || []
    },
    matchScore: normalizedMatchScore,
    matchedSkills: match.matchedSkills || [],
    missingSkills: match.missingSkills || [],
    skills: (job.requiredSkills?.length ? job.requiredSkills : job.skills || []).join(", ") || "Skills not listed"
  };
}

function applicationStatus(status) {
  return ({ APPLIED: "Applied", SCREENING: "Under Review", SHORTLISTED: "Shortlisted", INTERVIEW: "Interview", OFFER: "Offer", OFFERED: "Offer", ACCEPTED: "Selected", REJECTED: "Rejected" })[status] || status;
}

async function refreshCandidateData() {
  const [jobResult, recommendationResult, dashboardResult, notificationResult] = await Promise.all([
    window.apiRequest("/jobs?page=1&limit=12"),
    window.apiRequest("/jobs/recommended?page=1&limit=12"),
    window.apiRequest("/jobseeker/dashboard"),
    window.apiRequest("/notifications/mine?limit=30")
  ]);
  jobs = jobResult.jobs.map(normalizeJob);
  recommendedJobs = recommendationResult.jobs.map(normalizeJob);
  jobPagination = jobResult.pagination;
  savedJobs = dashboardResult.savedJobs.map(normalizeJob);
  savedJobIds = savedJobs.map(job => job.id);
  resumes = dashboardResult.resumes.map(resume => ({
    ...resume,
    id: String(resume.id || resume._id || ""),
    fileName: resume.fileName || resume.originalName || resume.name || "Resume file",
    uploadedAt: resume.uploadedAt || resume.createdAt || Date.now()
  })).filter(resume => resume.id);
  interviews = dashboardResult.interviews;
  staleApplicationIds = dashboardResult.staleApplications.map(String);
  notifications = notificationResult.notifications;
  unreadNotificationCount = notificationResult.unreadCount;
  applications = dashboardResult.applications.filter(application => application.jobId).map(application => ({
    id: String(application._id),
    jobId: String(application.jobId._id),
    title: application.jobId.title,
    company: application.jobId.company,
    status: applicationStatus(application.status),
    appliedAt: new Date(application.appliedAt || application.createdAt).toLocaleDateString(),
    updated: applicationStatus(application.status) + " · " + new Date(application.lastUpdatedAt || application.lastUpdated || application.createdAt).toLocaleDateString(),
    needsFollowUp: staleApplicationIds.includes(String(application._id)) || application.followUpRequired,
    statusHistory: application.statusHistory || []
  }));
  if ((recommendedJobs[0] || jobs[0]) && !selectedJobDetails) await selectJob((recommendedJobs[0] || jobs[0]).id);
}

async function loadJobs(filters = {}, page = 1) {
  jobFilters = { ...filters };
  const params = new URLSearchParams({ page: String(page), limit: "12" });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== false) params.set(key, String(value));
  });
  const result = await window.apiRequest(`/jobs?${params}`);
  jobs = result.jobs.map(normalizeJob);
  jobPagination = result.pagination;
}

async function selectJob(jobId) {
  const details = await window.apiRequest(`/jobs/${encodeURIComponent(jobId)}`);
  selectedJobDetails = details;
  selectedJobMatch = details.match;
}

function renderOverviewData() {
  const countFor = statuses => applications.filter(application => statuses.includes(application.status)).length;
  document.querySelector('[data-stat="applied"]').textContent = applications.length;
  document.querySelector('[data-stat="review"]').textContent = countFor(["Under Review"]);
  document.querySelector('[data-stat="shortlisted"]').textContent = countFor(["Shortlisted"]);
  document.querySelector('[data-stat="interviews"]').textContent = countFor(["Interview"]);
  document.getElementById("savedJobCount").textContent = savedJobIds.length;

  const featured = recommendedJobs[0] || jobs[0];
  const featuredMatchScore = featured ? normalizeMatchScore(featured.matchScore ?? featured.match?.score ?? null) : null;
  const featuredMatchLabel = featuredMatchScore === null ? "—" : `${Math.round(Math.max(0, Math.min(100, featuredMatchScore)))}%`;
  document.getElementById("featuredJob").innerHTML = featured
    ? `<div class="company-logo">${escapeHtml(String(featured.company || "HT").slice(0, 2).toUpperCase())}</div><div class="job-title"><h4>${escapeHtml(featured.title)}</h4><p>${escapeHtml(featured.company)} · ${escapeHtml(featured.location)}</p><div class="chips"><span>${escapeHtml(featured.type)}</span><span>${escapeHtml(featured.pay)}</span></div><div class="inline-actions"><button class="btn btn-dark" data-action="save-job" data-job-id="${escapeHtml(featured.id)}">${savedJobIds.includes(featured.id) ? "Saved" : "Save job"}</button><button class="btn btn-primary" data-action="apply-job" data-job-id="${escapeHtml(featured.id)}">Apply</button></div></div><div class="big-match"><b>${featuredMatchLabel}</b><small>match</small></div>`
    : `<div class="home-empty">No recommended jobs yet. Check back after recruiters publish vacancies.</div>`;

  // Derive the skill section from the same real match object used for the
  // featured job. Never display static demo percentages as candidate scores.
  const skillPanel = document.getElementById("featuredSkillMatch");
  const gapPanel = document.getElementById("featuredSkillGap");
  if (skillPanel) {
    const match = featured?.match || {};
    const components = match.components || match.matchComponents || {};
    const skillsScore = normalizeMatchScore(components.skills);
    const matchedSkills = Array.isArray(match.matchedSkills) ? match.matchedSkills : (Array.isArray(featured?.matchedSkills) ? featured.matchedSkills : []);
    const missingSkills = Array.isArray(match.missingSkills) ? match.missingSkills : (Array.isArray(featured?.missingSkills) ? featured.missingSkills : []);
    if (!featured) {
      skillPanel.innerHTML = '<p class="home-empty">Skill matching will appear when open jobs are available.</p>';
    } else if (skillsScore === null) {
      skillPanel.innerHTML = '<p class="home-empty">This job has no required skills to calculate a skill-match percentage.</p>';
    } else {
      const safeScore = Math.round(Math.max(0, Math.min(100, skillsScore)));
      const detail = matchedSkills.length || missingSkills.length
        ? `<p class="skill-match-summary">${matchedSkills.length} matched · ${missingSkills.length} missing from ${matchedSkills.length + missingSkills.length} listed required skills</p>`
        : '<p class="skill-match-summary">Based on the job requirements and skills saved in your profile.</p>';
      skillPanel.innerHTML = `<div class="skill-match-row"><span>Required skills match</span><i><b style="width:${safeScore}%"></b></i><strong>${safeScore}%</strong></div>${detail}`;
    }
  }
  if (gapPanel) {
    const match = featured?.match || {};
    const missingSkills = Array.isArray(match.missingSkills) ? match.missingSkills : (Array.isArray(featured?.missingSkills) ? featured.missingSkills : []);
    if (featured && missingSkills.length) {
      gapPanel.hidden = false;
      gapPanel.querySelector("b").textContent = `${missingSkills.length} skill gap${missingSkills.length === 1 ? "" : "s"} detected`;
      gapPanel.querySelector("small").textContent = `Missing required skills: ${missingSkills.slice(0, 4).join(", ")}${missingSkills.length > 4 ? "…" : ""}`;
    } else {
      gapPanel.hidden = true;
    }
  }

  const statusPanel = document.getElementById("applicationStatusPanel");
  statusPanel.innerHTML = `<div class="panel-head"><div><span class="section-kicker">APPLICATION STATUS</span><h3>Recent applications</h3></div><a href="#applications" data-view-link="applications">All applications →</a></div>${applications.length ? applications.slice(0, 4).map(application => `<div class="health-item"><div class="health-dot"></div><div><b>${escapeHtml(application.title)} · ${escapeHtml(application.company)}</b><small>${escapeHtml(application.updated)}</small></div><span>${escapeHtml(application.status)}</span></div>`).join("") : `<div class="home-empty">Your submitted applications and their status will appear here.</div>`}`;

  document.getElementById("recentPostedJobs").innerHTML = jobs.slice(0, 3).map(job => `<div class="home-job-row"><div><b>${escapeHtml(job.title)}</b><small>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</small></div><button data-view-link="find-jobs">View</button></div>`).join("") || `<div class="home-empty">No open roles have been posted yet.</div>`;
  document.getElementById("homeSavedJobs").innerHTML = savedJobs.slice(0, 3).map(job => `<div class="home-job-row"><div><b>${escapeHtml(job.title)}</b><small>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</small><small>${formatMatchPercent(job.matchScore ?? job.match?.score ?? null)} profile match</small></div><button data-action="remove-saved" data-job-id="${escapeHtml(job.id)}">Remove</button></div>`).join("") || `<div class="home-empty">Jobs you save will appear here.</div>`;

  const completion = 25 + (profile.email ? 25 : 0) + (candidateSkills.length ? 25 : 0) + (resumes.length ? 25 : 0);
  document.getElementById("profileCompletion").innerHTML = `<strong>${completion}%</strong><div><i style="width:${completion}%"></i></div><p>${completion === 100 ? "Your profile is ready for recruiters." : "Add your skills and resume to strengthen your profile."}</p>`;
  if (analyticsData) {
    const stages = [["Applied", analyticsData.counts.APPLIED], ["Screening", analyticsData.counts.SCREENING], ["Shortlisted", analyticsData.counts.SHORTLISTED], ["Interview", analyticsData.counts.INTERVIEW], ["Offer", analyticsData.counts.OFFERED + analyticsData.counts.ACCEPTED]];
    const maximum = Math.max(...stages.map(([, count]) => count), 1);
    document.getElementById("applicationFunnel").innerHTML = stages.map(([stage, count]) => `<div><span>${stage}</span><b style="width:${Math.max(count / maximum * 100, count ? 8 : 0)}%">${count}</b></div>`).join("");
  }
  const trustPanel = document.getElementById("trustPanel");
  if (trustPanel && selectedJobDetails) {
    const safety = selectedJobDetails.safety;
    trustPanel.innerHTML = `<div class="panel-head"><div><span class="section-kicker">JOB SAFETY · RISK ASSESSMENT</span><h3>${escapeHtml(selectedJobDetails.job.company)}</h3></div><a href="#trust" data-view-link="trust">Details →</a></div><div class="trust-score"><div class="trust-circle risk-${safety.riskLevel.toLowerCase()}"><b>${safety.riskScore}</b><small>/100 risk</small></div><div><p>${escapeHtml(safety.riskLevel)} <span class="safe">● Heuristic</span></p><div class="signal-list">${safety.positiveSignals.slice(0, 2).map(signal => `<span>✓ ${escapeHtml(signal)}</span>`).join("")}${safety.warnings.slice(0, 1).map(warning => `<span>⚠ ${escapeHtml(warning)}</span>`).join("")}</div></div></div>`;
  }
}

const viewRenderers = {
  "find-jobs": renderJobs,
  "recommended-jobs": renderRecommendedJobs,
  applications: renderApplications,
  "saved-jobs": renderSavedJobs,
  "career-gaps": renderCareerGaps,
  resumes: renderResumes,
  interviews: renderInterviews,
  profile: renderProfile,
  notifications: renderNotifications,
  "job-details": renderJobDetails,
  trust: renderTrust,
  analytics: renderAnalytics
};

function updateProfileLabels() {
  const initials = profile.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "HT";
  document.querySelector(".side-profile b").textContent = profile.name;
  document.querySelector(".side-profile small").textContent = profile.role === "recruiter" ? "Recruiter" : "Job Seeker";
  document.querySelector(".side-profile .avatar").textContent = initials;
  document.getElementById("headerAvatar").textContent = initials;
}

function renderView() {
  if (!viewDetails[currentView]) currentView = "overview";
  const [title, subtitle] = viewDetails[currentView];
  pageTitle.textContent = currentView === "overview" ? `${title}, ${profile.name}` : title;
  pageSubtitle.textContent = subtitle;
  overviewView.hidden = currentView !== "overview";
  contentView.hidden = currentView === "overview";
  contentView.innerHTML = currentView === "overview" ? "" : viewRenderers[currentView]();
  renderOverviewData();
  document.querySelectorAll("[data-view-link]").forEach(link => {
    link.classList.toggle("active", link.dataset.viewLink === currentView);
  });
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("savedJobCount").textContent = savedJobIds.length;
  updateProfileLabels();
}

function navigateTo(view) {
  if (!viewDetails[view]) return;
  currentView = view;
  window.history.pushState(null, "", `#${view}`);
  renderView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleAction(button) {
  const { action, jobId, applicationId } = button.dataset;
  if (action === "save-job") {
    try {
      const result = await window.apiRequest(`/jobs/${encodeURIComponent(jobId)}/save`, { method: "POST" });
      await refreshCandidateData();
      renderView();
      showToast(result.saved ? "Job saved" : "Job removed from saved jobs");
    } catch (error) {
      showToast(error.message);
    }
  } else if (action === "apply-job") {
    try {
      const resumeId = document.getElementById("applyResume")?.value;
      await window.apiRequest(`/jobs/${encodeURIComponent(jobId)}/apply`, { method: "POST", body: JSON.stringify({ resumeId: resumeId || undefined }) });
      await refreshCandidateData();
      renderView();
      showToast("Application submitted");
    } catch (error) {
      showToast(error.message);
    }
  } else if (action === "remove-saved") {
    if (!jobId) {
      showToast("Could not identify this saved job. Refresh and try again.");
      return;
    }
    button.disabled = true;
    try {
      await window.apiRequest(`/jobs/${encodeURIComponent(jobId)}/save`, { method: "POST" });
      await refreshCandidateData();
      const stillSaved = savedJobIds.some(id => String(id) === String(jobId));
      renderView();
      showToast(stillSaved ? "The job is still saved. Please try again." : "Job removed from saved jobs");
    } catch (error) {
      showToast(error.message);
      try { await refreshCandidateData(); renderView(); } catch {}
    } finally {
      button.disabled = false;
    }
  } else if (action === "view-job") {
    try {
      await selectJob(jobId);
      navigateTo("job-details");
    } catch (error) {
      showToast(error.message);
    }
  } else if (action === "remove-resume") {
    try {
      await window.apiRequest(`/resumes/${encodeURIComponent(button.dataset.resumeId)}`, { method: "DELETE" });
      await refreshCandidateData();
      renderView();
      showToast("Resume removed");
    } catch (error) { showToast(error.message); }
  } else if (action === "jobs-previous" || action === "jobs-next") {
    try {
      const page = jobPagination.page + (action === "jobs-next" ? 1 : -1);
      await loadJobs(jobFilters, page);
      renderView();
    } catch (error) { showToast(error.message); }
  } else if (action === "mark-read") {
    try {
      await window.apiRequest(`/notifications/${encodeURIComponent(button.dataset.notificationId)}/read`, { method: "PATCH" });
      await refreshCandidateData();
      renderView();
    } catch (error) { showToast(error.message); }
  } else if (action === "mark-all-read") {
    try {
      await window.apiRequest("/notifications/read-all", { method: "PATCH" });
      await refreshCandidateData();
      renderView();
      showToast("Notifications marked as read");
    } catch (error) { showToast(error.message); }
  } else if (action === "enable-push") {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support push notifications");
      const config = await window.apiRequest("/config");
      if (!config.vapidPublicKey) throw new Error("Push is not configured on the server yet");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser to enable alerts");
      const registration = await navigator.serviceWorker.register("sw.js");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(config.vapidPublicKey) });
      await window.apiRequest("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) });
      showToast("Browser notifications enabled");
    } catch (error) { showToast(error.message); }
  } else if (action === "test-push") {
    try {
      const result = await window.apiRequest("/push/test", { method: "POST" });
      showToast(result.message);
    } catch (error) { showToast(error.message); }
  } else if (action === "sign-out") {
    try { await window.apiRequest("/auth/logout", { method: "POST" }); } catch {}
    ["hiretrack_token", "hiretrack_demo_user", "hiretrack_role", "hiretrack_name"].forEach(key => localStorage.removeItem(key));
    window.location.href = "login.html";
  }
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

document.addEventListener("click", event => {
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) {
    event.preventDefault();
    navigateTo(viewLink.dataset.viewLink);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) handleAction(actionButton);
});

contentView.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "jobFilters") {
    const values = Object.fromEntries(new FormData(event.target).entries());
    values.remote = new FormData(event.target).has("remote");
    try {
      await loadJobs(values, 1);
      renderView();
    } catch (error) { showToast(error.message); }
  } else if (event.target.id === "resumeForm") {
    try {
      const formData = new FormData(event.target);
      const uploadResult = await window.apiRequest("/resumes/upload", { method: "POST", body: formData });
      await refreshCandidateData();
      renderView();
      const extractedCount = uploadResult.resume?.extractedSkills?.length || 0;
      showToast(extractedCount ? `Resume uploaded; ${extractedCount} skills extracted` : (uploadResult.message || "Resume uploaded; no readable skills detected"));
    } catch (error) { showToast(error.message); }
  } else if (event.target.id === "settingsForm") {
    const formData = new FormData(event.target);
    try {
      const result = await window.apiRequest("/jobseeker/profile", {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(formData.entries()))
      });
      profile = { ...profile, ...result.user };
      candidateSkills = result.user.skills || [];
      localStorage.setItem("hiretrack_name", profile.name);
      await refreshCandidateData();
      renderView();
      showToast("Profile saved");
    } catch (error) { showToast(error.message); }
  } else if (event.target.id === "analyticsRefresh") {
    try {
      analyticsData = await window.apiRequest("/analytics/mine");
      renderView();
    } catch (error) { showToast(error.message); }
  }
});

document.querySelector(".mobile-menu")?.addEventListener("click", () => {
  document.querySelector(".sidebar")?.classList.toggle("open");
});

window.addEventListener("popstate", () => {
  currentView = window.location.hash.slice(1) || "overview";
  renderView();
});

try {
  await refreshCandidateData();
  analyticsData = await window.apiRequest("/analytics/mine");
} catch (error) {
  showToast(error.message);
}
renderView();
})();