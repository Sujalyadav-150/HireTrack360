const forgotForm = document.getElementById("forgotPasswordForm");
const resetForm = document.getElementById("resetPasswordForm");
const recoveryMessage = document.getElementById("recoveryMessage");
const tokenMessage = document.getElementById("tokenMessage");
const resetToken = new URLSearchParams(window.location.search).get("token");

forgotForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  recoveryMessage.hidden = true;
  try {
    const result = await window.apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: new FormData(event.currentTarget).get("email") })
    });
    recoveryMessage.textContent = result.message;
    recoveryMessage.hidden = false;
  } catch (error) {
    recoveryMessage.textContent = error.message;
    recoveryMessage.hidden = false;
  } finally {
    button.disabled = false;
  }
});

if (resetForm) {
  if (!resetToken) {
    tokenMessage.textContent = "This reset link is invalid or expired. Request a new one.";
  } else {
    window.apiRequest(`/auth/verify-reset-token?token=${encodeURIComponent(resetToken)}`)
      .then(result => {
        resetForm.hidden = !result.valid;
        tokenMessage.hidden = result.valid;
        if (!result.valid) tokenMessage.textContent = "This reset link is invalid or expired. Request a new one.";
      })
      .catch(error => {
        // Only HTTP 400 means the token itself is invalid/expired.
        tokenMessage.textContent = error.status === 400
          ? "This reset link is invalid or expired. Request a new one."
          : "Could not verify the reset link (" + (error.status || "network error") + "). Open a fresh link from the latest email, or try again after deployment finishes."; 
      });
  }

  resetForm.addEventListener("submit", async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = values.get("password");
    const confirmPassword = values.get("confirmPassword");
    if (password !== confirmPassword) {
      recoveryMessage.textContent = "Passwords do not match.";
      recoveryMessage.hidden = false;
      return;
    }
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await window.apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password })
      });
      resetForm.hidden = true;
      tokenMessage.textContent = result.message;
      tokenMessage.hidden = false;
    } catch (error) {
      recoveryMessage.textContent = error.message;
      recoveryMessage.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}
