const roleButtons = document.querySelectorAll(".role-tab");
const roleInput = document.getElementById("role");
const emailLabel = document.getElementById("emailLabel");

const requestedRole = new URLSearchParams(window.location.search).get("role");
if (roleInput && ["jobseeker", "recruiter"].includes(requestedRole)) {
  roleInput.value = requestedRole;
  roleButtons.forEach(button => button.classList.toggle("active", button.dataset.role === requestedRole));
}

function showAuthMessage(message = "") {
  const box = document.getElementById("authMessage");
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

function redirectForRole(role) {
  window.location.href = role === "recruiter" ? "recruiter-dashboard.html" : "dashboard.html";
}

function saveSession(result) {
  localStorage.removeItem("hiretrack_token");
  localStorage.setItem("hiretrack_role", result.user.role);
  localStorage.setItem("hiretrack_name", result.user.name);
  localStorage.setItem("hiretrack_demo_user", result.user.email);
  redirectForRole(result.user.role);
}

roleButtons.forEach(button => {
  button.addEventListener("click", () => {
    roleButtons.forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    if (roleInput) roleInput.value = button.dataset.role;
    renderDynamicFields();
  });
});

function renderDynamicFields() {
  const box = document.getElementById("dynamicFields");
  if (emailLabel && roleInput) emailLabel.textContent = roleInput.value === "recruiter" ? "Work email" : "Email";
  if (!box || !roleInput) return;
  box.innerHTML = roleInput.value === "recruiter"
    ? `<div class="registration-fields"><label>Company name<input id="companyName" name="companyName" placeholder="Your company" required></label><label>Designation<input id="designation" placeholder="Talent Partner"></label><label>Company website<input id="companyWebsite" type="url" placeholder="https://company.com"></label><label>Company location<input id="companyLocation" placeholder="City, Country"></label><label>Company description<textarea id="companyDescription" rows="3" placeholder="What your company does"></textarea></label></div>`
    : `<div class="registration-fields"><label>Phone<input id="phone" type="tel" maxlength="30" placeholder="Optional"></label><label>Location<input id="location" maxlength="120" placeholder="City, Country"></label><label>Core skills<input id="skills" placeholder="SQL, Excel, Power BI, Python"></label><label>Experience<input id="experience" maxlength="120" placeholder="e.g. 2 years in analytics"></label><label>Education<input id="education" maxlength="200" placeholder="Degree or qualification"></label><label>Bio<textarea id="bio" rows="3" maxlength="1000" placeholder="A short professional introduction"></textarea></label></div>`;
}
renderDynamicFields();

document.getElementById("togglePass")?.addEventListener("click", event => {
  const input = document.getElementById("password");
  input.type = input.type === "password" ? "text" : "password";
  event.currentTarget.textContent = input.type === "password" ? "Show" : "Hide";
});

document.getElementById("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  showAuthMessage();
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        expectedRole: roleInput?.value
      })
    });
    saveSession(result);
  } catch (error) {
    showAuthMessage(error.message);
    submitButton.disabled = false;
  }
});

document.getElementById("signupForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  showAuthMessage();
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  submitButton.disabled = true;
  if (document.getElementById("password").value !== document.getElementById("confirmPassword").value) {
    showAuthMessage("Passwords do not match");
    submitButton.disabled = false;
    return;
  }
  const requestBody = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    role: roleInput.value
  };
  if (requestBody.role === "recruiter") {
    requestBody.companyName = document.getElementById("companyName").value;
    requestBody.designation = document.getElementById("designation").value;
    requestBody.companyWebsite = document.getElementById("companyWebsite").value;
    requestBody.companyLocation = document.getElementById("companyLocation").value;
    requestBody.companyDescription = document.getElementById("companyDescription").value;
  } else {
    requestBody.skills = document.getElementById("skills").value;
    requestBody.phone = document.getElementById("phone").value;
    requestBody.location = document.getElementById("location").value;
    requestBody.experience = document.getElementById("experience").value;
    requestBody.education = document.getElementById("education").value;
    requestBody.bio = document.getElementById("bio").value;
  }
  try {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(requestBody)
    });
    saveSession(result);
  } catch (error) {
    showAuthMessage(error.message);
    submitButton.disabled = false;
  }
});