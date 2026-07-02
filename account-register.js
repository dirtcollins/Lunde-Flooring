/* Lunde V6 — customer registration (server-backed account) */
(function () {
  var L = window.lunde || {};
  var form = document.getElementById("registerForm");
  var status = document.getElementById("registerStatus");
  var submit = document.getElementById("registerSubmit");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = ""; status.dataset.state = "";
    var name = String(form.elements.name.value || "").trim();
    var email = String(form.elements.email.value || "").trim();
    var password = String(form.elements.password.value || "");
    var confirm = String(form.elements.confirm.value || "");
    if (password.length < 10) { status.textContent = "Password must be at least 10 characters."; status.dataset.state = "error"; return; }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { status.textContent = "Password must include uppercase, lowercase, and a number."; status.dataset.state = "error"; return; }
    if (password !== confirm) { status.textContent = "Passwords do not match."; status.dataset.state = "error"; return; }
    submit.disabled = true; submit.textContent = "Creating…";
    var r = null;
    try { r = await L.createCustomerAccount({ name: name, email: email, password: password }); } catch (err) { r = { ok: false, error: "Something went wrong. Try again." }; }
    if (r && r.ok) {
      form.hidden = true;
      status.dataset.state = "success";
      status.innerHTML = "Account created. Check your email and click the verification link before signing in." +
        (r.devVerificationUrl ? '<br><a href="' + r.devVerificationUrl + '">Open local verification link</a>' : "") +
        '<br><a href="/account/login">Go to sign in</a>';
      return;
    }
    status.textContent = (r && r.error) || "Could not create the account.";
    status.dataset.state = "error";
    submit.disabled = false; submit.textContent = "Create account";
  });
})();
