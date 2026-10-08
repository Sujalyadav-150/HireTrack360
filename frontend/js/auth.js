const API_BASE = "http://localhost:5000/api";
const roleButtons = document.querySelectorAll(".role-tab");
const roleInput = document.getElementById("role");

roleButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    roleButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    roleInput.value = btn.dataset.role;
    renderDynamicFields();
  });
});

function renderDynamicFields(){
  const box = document.getElementById("dynamicFields");
  if(!box) return;
  box.innerHTML = roleInput.value === "recruiter"
    ? `<label>Company name<input id="companyName" placeholder="Your company"></label>`
    : `<label>Core skills<input id="skills" placeholder="SQL, Excel, Power BI, Python"></label>`;
}
renderDynamicFields();

document.getElementById("togglePass")?.addEventListener("click", e => {
  const input = document.getElementById("password");
  input.type = input.type === "password" ? "text" : "password";
  e.target.textContent = input.type === "password" ? "Show" : "Hide";
});

document.getElementById("loginForm")?.addEventListener("submit", e => {
  e.preventDefault();
  const role = roleInput.value;
  localStorage.setItem("hiretrack_role", role);
  localStorage.setItem("hiretrack_demo_user", document.getElementById("email").value);
  window.location.href = "dashboard.html";
});

document.getElementById("signupForm")?.addEventListener("submit", e => {
  e.preventDefault();
  localStorage.setItem("hiretrack_role", roleInput.value);
  localStorage.setItem("hiretrack_demo_user", document.getElementById("email").value);
  window.location.href = "dashboard.html";
});
