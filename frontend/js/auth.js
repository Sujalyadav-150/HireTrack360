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

function fieldValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function redirectForRole(role) {
  window.location.href = role === "recruiter" ? "recruiter-dashboard.html" : "dashboard.html";
}

function saveSession(result) {
  // Keep the bearer token for the dashboard API requests and the HTTP-only cookie
  // for same-origin session continuity. Older deployments returned only a cookie.
  if (result.token) localStorage.setItem("hiretrack_token", result.token);
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
  if (emailLabel && roleInput) {
    const textNode = Array.from(emailLabel.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = roleInput.value === "recruiter" ? "Work email " : "Email ";
  }
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

  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const nameInput = document.getElementById("name");

  // Validate explicitly so the user gets a readable message even when browser
  // validation UI behaves differently or the email control was previously hidden.
  if (!nameInput?.value.trim()) {
    showAuthMessage("Please enter your full name.");
    nameInput?.focus();
    return;
  }
  const email = emailInput?.value.trim() || "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    showAuthMessage("Please enter a valid email address.");
    emailInput?.focus();
    return;
  }
  if ((passwordInput?.value || "").length < 8) {
    showAuthMessage("Password must be at least 8 characters.");
    passwordInput?.focus();
    return;
  }
  if (passwordInput.value !== confirmPasswordInput?.value) {
    showAuthMessage("Passwords do not match.");
    confirmPasswordInput?.focus();
    return;
  }
  if (roleInput?.value === "recruiter" && !fieldValue("companyName")) {
    showAuthMessage("Please enter your company name.");
    document.getElementById("companyName")?.focus();
    return;
  }

  const requestBody = {
    name: nameInput.value.trim(),
    email,
    password: passwordInput.value,
    role: roleInput?.value || "jobseeker"
  };

  if (requestBody.role === "recruiter") {
    requestBody.companyName = fieldValue("companyName");
    requestBody.designation = fieldValue("designation");
    requestBody.companyWebsite = fieldValue("companyWebsite");
    requestBody.companyLocation = fieldValue("companyLocation");
    requestBody.companyDescription = fieldValue("companyDescription");
  } else {
    requestBody.skills = fieldValue("skills");
    requestBody.phone = fieldValue("phone");
    requestBody.location = fieldValue("location");
    requestBody.experience = fieldValue("experience");
    requestBody.education = fieldValue("education");
    requestBody.bio = fieldValue("bio");
  }

  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  try {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(requestBody)
    });
    if (!result?.user) throw new Error("Account was created but the server response was incomplete. Please sign in.");
    saveSession(result);
  } catch (error) {
    showAuthMessage(error.message || "Could not create your account. Check the server and try again.");
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
  }
});