if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(console.error);
}
const role = localStorage.getItem("hiretrack_role") || "job_seeker";
if (role === "recruiter") {
  document.title = "Recruiter Dashboard — HireTrack 360";
}
document.querySelector(".mobile-menu")?.addEventListener("click", () => {
  document.querySelector(".sidebar")?.classList.toggle("open");
});
