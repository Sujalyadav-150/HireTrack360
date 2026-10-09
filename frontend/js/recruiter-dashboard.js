(async function initializeRecruiterDashboard() {
  const overviewView = document.getElementById("overviewView");
  const contentView = document.getElementById("contentView");
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const toast = document.getElementById("dashboardToast");
  const candidateDialog = document.getElementById("candidateDialog");
  const jobDialog = document.getElementById("jobDialog");
  const emptyMessage = "No records yet. Post a job to start building your hiring pipeline.";
  let user;
  let jobs = [];
  let applications = [];
  let interviews = [];
  let notifications = [];
  let unreadNotifications = 0;
  let analytics = null;
  let stats = {};
  let view = location.hash.slice(1) || "overview";
  let toastTimer;

  const viewInfo = {
    overview: ["Recruiter dashboard", "Your hiring pipeline at a glance."],
    "post-job": ["Post a job", "Create a vacancy and start receiving applications."],
    "my-jobs": ["My jobs", "Manage your open and closed vacancies."],
    applications: ["Applications", "Review every application for your vacancies."],
    candidates: ["Candidates", "Review candidate profiles and update their status."],
    shortlisted: ["Shortlisted candidates", "Candidates selected for the next stage."],
    interviews: ["Interviews", "Candidates moved into the interview stage."],
    company: ["Company profile", "Keep your employer details current."],
    notifications: ["Notifications", "Recent activity from your hiring pipeline."],
    analytics: ["Recruitment analytics", "Conversion through your hiring pipeline."]
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function notify(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  async function request(path, options = {}) {
    // Clear stale role sessions instead of attempting a mutation as the wrong account.
    const result = await window.apiRequest(path, options);
    return result;
  }

  function scoreValue(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.round(Number(value));
    if (value && typeof value === "object") {
      const nested = value.score ?? value.matchScore ?? value.value;
      if (nested !== undefined && nested !== value) return scoreValue(nested);
    }
    return null;
  }

  async function loadDashboard() {
    const [result, interviewResult, notificationResult] = await Promise.all([
      request("/recruiter/dashboard"),
      request("/interviews/mine"),
      request("/notifications/mine?limit=30")
    ]);
    user = result.user;
    jobs = result.jobs;
    applications = result.applications;
    interviews = interviewResult.interviews;
    notifications = notificationResult.notifications;
    unreadNotifications = notificationResult.unreadCount;
    stats = result.stats;
    updateProfile();
    if (view === "analytics") analytics = await request("/analytics/recruiter");
    render();
  }

  function updateProfile() {
    const initials = user.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("sideName").textContent = user.name;
    document.getElementById("sideCompany").textContent = user.companyName || "Recruiter";
    document.getElementById("sideAvatar").textContent = initials;
    document.getElementById("headerAvatar").textContent = initials;
  }

  function statusLabel(status) {
    return ({ APPLIED: "New", SCREENING: "Under review", SHORTLISTED: "Shortlisted", INTERVIEW: "Interview", OFFER: "Offer", OFFERED: "Offer", ACCEPTED: "Hired", REJECTED: "Rejected" })[status] || status;
  }

  function jobRow(job) {
    return `<tr><td><strong>${escapeHtml(job.title)}</strong><small>${escapeHtml(job.company)}</small></td><td>${escapeHtml(job.location || "-")}</td><td>${escapeHtml(job.employmentType || "Full-time")}</td><td>${formatDate(job.createdAt)}</td><td>${job.applicationCount || 0}</td><td><span class="recruiter-status ${job.status === "OPEN" ? "status-open" : "status-closed"}">${job.status === "OPEN" ? "Active" : "Closed"}</span></td><td><div class="table-actions"><button class="table-action" data-action="edit-job" data-job-id="${escapeHtml(job._id)}">Edit</button>${job.status === "OPEN" ? `<button class="table-action" data-action="close-job" data-job-id="${escapeHtml(job._id)}">Close</button>` : `<button class="table-action" data-action="open-job" data-job-id="${escapeHtml(job._id)}">Reopen</button>`}</div></td></tr>`;
  }

  function applicationRow(application) {
    const candidate = application.candidateId || {};
    const job = application.jobId || {};
    const skills = Array.isArray(candidate.skills) && candidate.skills.length ? candidate.skills.slice(0, 4).join(", ") : "Not added";
    const applicationId = escapeHtml(application._id);
    const matchScore = scoreValue(application.matchScore ?? application.match?.score ?? application.matchComponents?.score);
    const matchText = matchScore === null ? "—" : `${matchScore}%`;
    return `<tr><td><strong>${escapeHtml(candidate.name || "Candidate")}</strong><small>${escapeHtml(candidate.email || "")}</small><button class="text-action" data-action="view-candidate" data-application-id="${applicationId}">View profile</button></td><td>${escapeHtml(job.title || "Job removed")}</td><td>${escapeHtml(skills)}<small>Match ${matchText}</small></td><td>${formatDate(application.appliedAt || application.createdAt)}</td><td><span class="recruiter-status status-${escapeHtml(application.status.toLowerCase())}">${escapeHtml(statusLabel(application.status))}</span></td><td><div class="table-actions">${application.status === "APPLIED" ? `<button class="table-action" data-action="set-status" data-status="SCREENING" data-application-id="${applicationId}">Screen</button>` : ""}${!["SHORTLISTED", "INTERVIEW", "OFFERED", "ACCEPTED", "REJECTED"].includes(application.status) ? `<button class="table-action" data-action="set-status" data-status="SHORTLISTED" data-application-id="${applicationId}">Shortlist</button>` : ""}${!["INTERVIEW", "OFFERED", "ACCEPTED", "REJECTED"].includes(application.status) ? `<button class="table-action" data-action="schedule-interview" data-application-id="${applicationId}">Interview</button>` : ""}${application.status === "INTERVIEW" ? `<button class="table-action" data-action="set-status" data-status="OFFERED" data-application-id="${applicationId}">Offer</button>` : ""}${application.status === "OFFERED" ? `<button class="table-action" data-action="set-status" data-status="ACCEPTED" data-application-id="${applicationId}">Hire</button>` : ""}${!["REJECTED", "ACCEPTED"].includes(application.status) ? `<button class="table-action danger-action" data-action="set-status" data-status="REJECTED" data-application-id="${applicationId}">Reject</button>` : ""}</div></td></tr>`;
  }

  function table(headers, rows, empty = emptyMessage) {
    if (!rows.length) return `<div class="recruiter-empty"><strong>Nothing here yet</strong><p>${escapeHtml(empty)}</p></div>`;
    return `<div class="recruiter-table-wrap"><table class="recruiter-table"><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function renderOverview() {
    const recentApplications = applications.slice(0, 5);
    return `<section class="recruiter-stats">
      <article><span>Active jobs</span><strong>${stats.openJobs || 0}</strong><small>Currently accepting applicants</small></article>
      <article><span>Total applications</span><strong>${stats.totalApplications || 0}</strong><small>Across your job listings</small></article>
      <article><span>New applications</span><strong>${stats.newApplications || 0}</strong><small>Ready for review</small></article>
      <article><span>Shortlisted</span><strong>${stats.shortlistedCandidates || 0}</strong><small>Moving forward</small></article>
      <article><span>Interviews</span><strong>${stats.interviewsScheduled || 0}</strong><small>In the interview stage</small></article>
      <article><span>Jobs closed</span><strong>${stats.jobsClosed || 0}</strong><small>No longer accepting applicants</small></article>
      <article><span>Offers</span><strong>${stats.offers || 0}</strong><small>Offers extended</small></article>
      <article><span>Hires</span><strong>${stats.hires || 0}</strong><small>Accepted offers</small></article>
    </section>
    <section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">HIRING PIPELINE</span><h3>My active jobs</h3></div><button class="btn btn-primary" data-view-link="post-job">＋ Post a job</button></div>${table(["Job", "Location", "Type", "Posted", "Applications", "Status", "Actions"], jobs.filter(job => job.status === "OPEN").map(job => jobRow(job)), "No active vacancies. Post a job to begin receiving applications.")}</section>
    <section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">LATEST ACTIVITY</span><h3>Recent applications</h3></div><button class="text-action" data-view-link="applications">All applications →</button></div>${table(["Candidate", "Applied job", "Skills", "Applied", "Status", "Actions"], recentApplications.map(applicationRow), "No applications have arrived yet.")}</section>`;
  }

  function renderPostJob() {
    return `<form id="postJobForm" class="recruiter-form"><label>Job title<input name="title" required placeholder="e.g. Senior Product Designer"></label><div class="two-col"><label>Location<input name="location" required placeholder="City or Remote"></label><label>Job type<select name="employmentType"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option><option>Hybrid</option><option>Remote</option></select></label></div><div class="two-col"><label>Minimum annual salary<input name="salaryMin" type="number" min="0" placeholder="Optional"></label><label>Maximum annual salary<input name="salaryMax" type="number" min="0" placeholder="Optional"></label></div><label>Required skills<input name="requiredSkills" placeholder="React, UX research, Figma"></label><label>Experience<input name="experience" placeholder="e.g. 3+ years"></label><label>Responsibilities (one per line)<textarea name="responsibilities" rows="3"></textarea></label><label>Job description<textarea name="description" rows="6" required placeholder="Responsibilities, requirements, and benefits"></textarea></label><div class="two-col"><label>Application deadline<input name="deadline" type="date"></label><label class="toggle-row"><input name="remote" type="checkbox"> Remote role</label></div><button class="btn btn-primary" type="submit">Publish job</button></form>`;
  }

  function renderMyJobs() {
    return `<section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">VACANCIES</span><h3>${jobs.length} jobs</h3></div><button class="btn btn-primary" data-view-link="post-job">＋ Post a job</button></div>${table(["Job", "Location", "Type", "Posted", "Applications", "Status", "Actions"], jobs.map(jobRow), "You have not posted any jobs yet.")}</section>`;
  }

  function renderApplications() {
    return `<section class="recruiter-panel">${table(["Candidate", "Applied job", "Skills", "Applied", "Status", "Actions"], applications.map(applicationRow), "Your job listings do not have any applications yet.")}</section>`;
  }

  function renderCandidates(filter) {
    const selected = filter === "shortlisted"
      ? applications.filter(application => application.status === "SHORTLISTED")
      : applications.filter(application => application.status !== "REJECTED");
    return `<section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">TALENT PIPELINE</span><h3>${selected.length} candidates</h3></div></div>${table(["Candidate", "Applied job", "Skills", "Applied", "Status", "Actions"], selected.map(applicationRow), filter === "shortlisted" ? "Shortlist candidates from your applications to see them here." : "Candidates appear here when someone applies to one of your jobs.")}</section>`;
  }

  function renderInterviews() {
    const rows = interviews.map(interview => `<tr><td><strong>${escapeHtml(interview.candidateId?.name || "Candidate")}</strong><small>${escapeHtml(interview.candidateId?.email || "")}</small></td><td>${escapeHtml(interview.jobId?.title || "Job")}</td><td>${formatDate(interview.scheduledAt)} ${new Date(interview.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td><td><span class="recruiter-status status-${escapeHtml(interview.status.toLowerCase())}">${escapeHtml(interview.status)}</span></td><td>${interview.status === "SCHEDULED" ? `<button class="table-action" data-action="interview-status" data-status="COMPLETED" data-interview-id="${escapeHtml(interview._id)}">Complete</button><button class="table-action danger-action" data-action="interview-status" data-status="CANCELLED" data-interview-id="${escapeHtml(interview._id)}">Cancel</button>` : ""}</td></tr>`);
    const eligible = applications.filter(application => !["REJECTED", "OFFERED", "ACCEPTED"].includes(application.status));
    return `<section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">INTERVIEW CALENDAR</span><h3>${interviews.length} interviews</h3></div></div>${table(["Candidate", "Job", "Scheduled", "Status", "Actions"], rows, "No interviews are scheduled yet.")}</section><form id="scheduleInterviewForm" class="recruiter-form"><h3>Schedule an interview</h3><label>Application<select name="applicationId" required>${eligible.map(application => `<option value="${escapeHtml(application._id)}">${escapeHtml(application.candidateId?.name || "Candidate")} · ${escapeHtml(application.jobId?.title || "Job")}</option>`).join("")}</select></label><div class="two-col"><label>Date and time<input type="datetime-local" name="scheduledAt" required></label><label>Interview type<select name="interviewType"><option value="VIDEO">Video</option><option value="PHONE">Phone</option><option value="ONSITE">On-site</option></select></label></div><label>Meeting link<input name="meetingLink" type="url" placeholder="https://"></label><label>Notes<textarea name="notes" rows="3"></textarea></label><button class="btn btn-primary" type="submit" ${eligible.length ? "" : "disabled"}>Schedule interview</button></form>`;
  }

  function renderCompany() {
    return `<form id="companyForm" class="recruiter-form"><label>Recruiter name<input name="name" required value="${escapeHtml(user.name)}"></label><label>Work email<input value="${escapeHtml(user.email)}" disabled></label><label>Company name<input name="companyName" required value="${escapeHtml(user.companyName || "")}"></label><label>Designation<input name="designation" value="${escapeHtml(user.designation || "")}"></label><label>Company website<input name="companyWebsite" type="url" value="${escapeHtml(user.companyWebsite || "")}" placeholder="https://"></label><label>Company location<input name="companyLocation" value="${escapeHtml(user.companyLocation || "")}"></label><label>Company description<textarea name="companyDescription" rows="5">${escapeHtml(user.companyDescription || "")}</textarea></label><button class="btn btn-primary" type="submit">Save company profile</button></form>`;
  }

  function renderNotifications() {
    return `<section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">NOTIFICATION CENTER</span><h3>${unreadNotifications} unread</h3></div><button class="table-action" data-action="mark-all-read">Mark all read</button></div>${notifications.length ? notifications.map(notification => `<article class="view-card compact-row notification-row ${notification.read ? "read" : "unread"}"><div><span class="section-kicker">${escapeHtml(notification.type)} · ${formatDate(notification.createdAt)}</span><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p></div>${notification.read ? "" : `<button class="table-action" data-action="mark-read" data-notification-id="${escapeHtml(notification._id)}">Mark read</button>`}</article>`).join("") : `<div class="recruiter-empty"><strong>You are all caught up</strong><p>New applications and status updates will appear here.</p></div>`}<div class="push-settings"><button class="btn btn-primary" data-action="enable-push">Enable browser notifications</button><button class="btn btn-ghost" data-action="test-push">Send test notification</button></div></section>`;
  }

  function renderAnalytics() {
    if (!analytics) return `<section class="recruiter-panel"><p>Load analytics from the recruiter workspace.</p></section>`;
    const result = analytics;
    const statsRows = [["Jobs posted", result.jobsPosted], ["Active jobs", result.activeJobs], ["Applicants", result.applicants], ["Shortlisted", result.shortlisted], ["Interviews", result.interviews], ["Offers", result.offers], ["Hires", result.hires]];
    const maxCount = Math.max(...statsRows.map(([, count]) => count), 1);
    return `<section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">CONVERSION</span><h3>Hiring funnel</h3></div><span>Shortlist ${result.shortlistRate}% · Interview ${result.interviewRate}%</span></div><div class="analytics-list">${statsRows.map(([label, count]) => `<div class="analytics-row"><span>${escapeHtml(label)}</span><div><i style="width:${Math.max(count / maxCount * 100, count ? 8 : 0)}%"></i></div><strong>${count}</strong></div>`).join("")}</div></section><section class="recruiter-panel"><div class="recruiter-panel-head"><div><span class="section-kicker">JOB PERFORMANCE</span><h3>Applications per job</h3></div></div>${table(["Job", "Applications"], result.applicationsPerJob.map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${item.count}</td></tr>`), "Post a job to see application performance.")}</section>`;
  }

  const renderers = {
    "post-job": renderPostJob,
    "my-jobs": renderMyJobs,
    applications: renderApplications,
    candidates: () => renderCandidates("all"),
    shortlisted: () => renderCandidates("shortlisted"),
    interviews: renderInterviews,
    company: renderCompany,
    notifications: renderNotifications,
    analytics: renderAnalytics
  };

  function render() {
    if (!viewInfo[view]) view = "overview";
    const [title, subtitle] = viewInfo[view];
    pageTitle.textContent = title;
    pageSubtitle.textContent = subtitle;
    overviewView.hidden = view !== "overview";
    contentView.hidden = view === "overview";
    overviewView.innerHTML = view === "overview" ? renderOverview() : "";
    contentView.innerHTML = view === "overview" ? "" : renderers[view]();
    document.querySelectorAll("[data-view-link]").forEach(link => {
      link.classList.toggle("active", link.dataset.viewLink === view);
    });
    document.querySelector(".sidebar").classList.remove("open");
  }

  async function navigate(nextView) {
    if (!viewInfo[nextView]) return;
    if (nextView === "analytics") analytics = await request("/analytics/recruiter");
    view = nextView;
    history.pushState(null, "", `#${view}`);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateApplication(applicationId, status) {
    await request(`/recruiter/applications/${encodeURIComponent(applicationId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadDashboard();
    notify(`Candidate moved to ${statusLabel(status).toLowerCase()}`);
  }

  document.addEventListener("click", async event => {
    const viewLink = event.target.closest("[data-view-link]");
    if (viewLink) {
      event.preventDefault();
      await navigate(viewLink.dataset.viewLink);
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    try {
      if (action.dataset.action === "sign-out") {
        try { await request("/auth/logout", { method: "POST" }); } catch {}
        ["hiretrack_token", "hiretrack_demo_user", "hiretrack_role", "hiretrack_name"].forEach(key => localStorage.removeItem(key));
        location.href = "login.html";
      } else if (action.dataset.action === "close-dialog") {
        candidateDialog.close();
      } else if (action.dataset.action === "close-job-dialog") {
        jobDialog.close();
      } else if (action.dataset.action === "edit-job") {
        const job = jobs.find(item => item._id === action.dataset.jobId);
        if (!job) return;
        const form = document.getElementById("editJobForm");
        for (const field of ["title", "location", "employmentType", "salaryMin", "salaryMax", "experience", "description"]) {
          form.elements[field].value = job[field] || "";
        }
        form.elements.requiredSkills.value = (job.requiredSkills || job.skills || []).join(", ");
        form.elements.remote.checked = Boolean(job.remote);
        form.elements.jobId.value = job._id;
        jobDialog.showModal();
      } else if (action.dataset.action === "close-job" || action.dataset.action === "open-job") {
        const status = action.dataset.action === "close-job" ? "CLOSED" : "OPEN";
        await request(`/recruiter/jobs/${encodeURIComponent(action.dataset.jobId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
        await loadDashboard();
        notify(`Job ${status === "OPEN" ? "reopened" : "closed"}`);
      } else if (action.dataset.action === "set-status") {
        await updateApplication(action.dataset.applicationId, action.dataset.status);
      } else if (action.dataset.action === "schedule-interview") {
        await navigate("interviews");
        const selector = document.querySelector('#scheduleInterviewForm [name="applicationId"]');
        if (selector) selector.value = action.dataset.applicationId;
      } else if (action.dataset.action === "interview-status") {
        await request(`/interviews/${encodeURIComponent(action.dataset.interviewId)}`, { method: "PATCH", body: JSON.stringify({ status: action.dataset.status }) });
        await loadDashboard();
        notify(`Interview marked ${action.dataset.status.toLowerCase()}`);
      } else if (action.dataset.action === "mark-read") {
        await request(`/notifications/${encodeURIComponent(action.dataset.notificationId)}/read`, { method: "PATCH" });
        await loadDashboard();
        navigate("notifications");
      } else if (action.dataset.action === "mark-all-read") {
        await request("/notifications/read-all", { method: "PATCH" });
        await loadDashboard();
        notify("Notifications marked as read");
      } else if (action.dataset.action === "download-resume") {
        await window.downloadProtectedFile(action.dataset.resumeUrl, action.dataset.fileName);
      } else if (action.dataset.action === "enable-push") {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support push notifications");
        const config = await request("/config");
        if (!config.vapidPublicKey) throw new Error("Push is not configured on the server yet");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Allow notifications in your browser to enable alerts");
        const registration = await navigator.serviceWorker.register("sw.js");
        const paddedKey = config.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(config.vapidPublicKey.length / 4) * 4, "=");
        const applicationServerKey = Uint8Array.from(atob(paddedKey), character => character.charCodeAt(0));
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        await request("/push/subscribe", { method: "POST", body: JSON.stringify(subscription) });
        notify("Browser notifications enabled");
      } else if (action.dataset.action === "test-push") {
        const result = await request("/push/test", { method: "POST" });
        notify(result.message);
      } else if (action.dataset.action === "view-candidate") {
        const application = applications.find(item => item._id === action.dataset.applicationId);
        if (!application) return;
        const candidate = application.candidateId || {};
        document.getElementById("candidateDialogTitle").textContent = candidate.name || "Candidate profile";
        const resumeLinks = (candidate.resumeVersions || []).map(resume => {
          const url = String(resume.url || "");
          const safeUrl = /^\/api\/resumes\/[a-f\d]{24}\/download$/i.test(url) ? url : "";
          return safeUrl ? `<button class="table-action" data-action="download-resume" data-resume-url="${escapeHtml(safeUrl)}" data-file-name="${escapeHtml(resume.name || "Resume")}">${escapeHtml(resume.name || "Download resume")}</button>` : "";
        }).filter(Boolean);
        const matchValue = scoreValue(application.matchScore ?? application.match?.score ?? application.matchComponents?.score);
        const matchLabel = matchValue === null ? "—" : `${matchValue}%`;
        document.getElementById("candidateDialogBody").innerHTML = `<p><strong>Email:</strong> ${escapeHtml(candidate.email || "Not provided")}</p><p><strong>Location:</strong> ${escapeHtml(candidate.location || "Not provided")}</p><p><strong>Experience:</strong> ${escapeHtml(candidate.experience || "Not provided")}</p><p><strong>Skills:</strong> ${escapeHtml((candidate.skills || []).join(", ") || "Not added")}</p><p><strong>Applied for:</strong> ${escapeHtml(application.jobId?.title || "Job removed")}</p><p><strong>Match:</strong> ${matchLabel} · Matched ${escapeHtml((application.matchedSkills || []).join(", ") || "none")}</p><div class="dialog-resumes"><strong>Resume:</strong> ${resumeLinks.length ? resumeLinks.join("") : "No resume on file"}</div>`;
        candidateDialog.showModal();
      }
    } catch (error) {
      notify(error.message);
    }
  });

  document.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (form.id === "postJobForm") {
        const result = Object.fromEntries(data.entries());
        result.remote = data.has("remote");
        await request("/recruiter/jobs", { method: "POST", body: JSON.stringify(result) });
        await loadDashboard();
        navigate("my-jobs");
        notify("Job published");
      } else if (form.id === "companyForm") {
        const result = await request("/recruiter/profile", {
          method: "PATCH",
          body: JSON.stringify(Object.fromEntries(data.entries()))
        });
        user = result.user;
        updateProfile();
        render();
        notify("Company profile saved");
      } else if (form.id === "scheduleInterviewForm") {
        const interviewData = Object.fromEntries(data.entries());
        interviewData.scheduledAt = new Date(interviewData.scheduledAt).toISOString();
        await request("/interviews", { method: "POST", body: JSON.stringify(interviewData) });
        await loadDashboard();
        navigate("interviews");
        notify("Interview scheduled and candidate notified");
      } else if (form.id === "editJobForm") {
        const jobId = data.get("jobId");
        const updates = Object.fromEntries(data.entries());
        delete updates.jobId;
        updates.remote = data.has("remote");
        updates.requiredSkills = String(updates.requiredSkills || "").split(",").map(skill => skill.trim()).filter(Boolean);
        await request(`/recruiter/jobs/${encodeURIComponent(jobId)}`, { method: "PATCH", body: JSON.stringify(updates) });
        jobDialog.close();
        await loadDashboard();
        notify("Job updated");
      }
    } catch (error) {
      notify(error.message);
      button.disabled = false;
    }
  });

  document.querySelector(".mobile-menu")?.addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  window.addEventListener("popstate", async () => {
    view = location.hash.slice(1) || "overview";
    if (view === "analytics") analytics = await request("/analytics/recruiter");
    render();
  });
  try {
    const session = await request("/auth/me");
    if (session.user.role === "jobseeker") {
      location.href = "dashboard.html";
      return;
    }
    if (session.user.role !== "recruiter") throw new Error("This account does not have recruiter access");
    await loadDashboard();
  } catch {
    localStorage.removeItem("hiretrack_token");
    location.href = "login.html";
  }
})();
