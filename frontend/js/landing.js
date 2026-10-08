const dashboardLink = document.getElementById("dashboardLink");
window.apiRequest("/auth/me").then(result => {
  dashboardLink.href = result.user.role === "recruiter" ? "recruiter-dashboard.html" : "dashboard.html";
  dashboardLink.hidden = false;
  document.querySelectorAll(".nav-actions > a:not(#dashboardLink), .hero-actions").forEach(element => { element.hidden = true; });
}).catch(() => {});
