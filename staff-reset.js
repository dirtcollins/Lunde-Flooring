/* Lunde — staff console password reset */
(function () {
  var L = window.lunde || {};
  var token = new URLSearchParams(location.search).get("token") || "";
  var requestForm = document.getElementById("requestForm");
  var resetForm = document.getElementById("resetForm");
  var requestStatus = document.getElementById("requestStatus");
  var resetStatus = document.getElementById("resetStatus");
  var requestSubmit = document.getElementById("requestSubmit");
  var resetSubmit = document.getElementById("resetSubmit");

  if (token) {
    requestForm.hidden = true;
    resetForm.hidden = false;
    document.getElementById("resetIntro").textContent = "Choose a new password for your staff account.";
  }

  requestForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    requestStatus.textContent = ""; requestStatus.dataset.state = "";
    requestSubmit.disabled = true; requestSubmit.textContent = "Sending…";
    var email = String(requestForm.elements.email.value || "").trim();
    var r = null;
    try { r = await L.staffRequestPasswordReset(email); } catch (err) { r = { ok: false, error: "Something went wrong. Try again." }; }
    if (r && r.ok) {
      requestStatus.innerHTML = "If a staff account exists and email delivery is configured, reset instructions will be sent." + (r.devResetUrl ? '<br><a href="' + r.devResetUrl + '">Open local reset link</a>' : "");
      requestStatus.dataset.state = "success";
    } else {
      requestStatus.textContent = (r && r.error) || "Could not send reset instructions.";
      requestStatus.dataset.state = "error";
    }
    requestSubmit.disabled = false; requestSubmit.textContent = "Send reset link";
  });

  resetForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    resetStatus.textContent = ""; resetStatus.dataset.state = "";
    var password = String(resetForm.elements.password.value || "");
    var confirm = String(resetForm.elements.confirm.value || "");
    if (password.length < 10) { resetStatus.textContent = "Password must be at least 10 characters."; resetStatus.dataset.state = "error"; return; }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { resetStatus.textContent = "Password must include uppercase, lowercase, and a number."; resetStatus.dataset.state = "error"; return; }
    if (password !== confirm) { resetStatus.textContent = "Passwords do not match."; resetStatus.dataset.state = "error"; return; }
    resetSubmit.disabled = true; resetSubmit.textContent = "Updating…";
    var r = null;
    try { r = await L.staffResetPassword(token, password); } catch (err) { r = { ok: false, error: "Something went wrong. Try again." }; }
    if (r && r.ok) { location.href = "/admin?reset=1"; return; }
    resetStatus.textContent = (r && r.error) || "Could not update the password.";
    resetStatus.dataset.state = "error";
    resetSubmit.disabled = false; resetSubmit.textContent = "Update password";
  });
})();
