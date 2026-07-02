/* Lunde V6 — customer sign in (server-authoritative) */
(function () {
  var L = window.lunde || {};
  var form = document.getElementById("loginForm");
  var status = document.getElementById("loginStatus");
  var submit = document.getElementById("loginSubmit");
  var resendEmail = "";

  function nextUrl() {
    var next = new URLSearchParams(location.search).get("next");
    if (next && /^\/[\w./-]*$/.test(next)) return next;
    return "/account";
  }

  var params = new URLSearchParams(location.search);
  if (params.get("verified") === "1") { status.textContent = "Email verified. You can sign in now."; status.dataset.state = "success"; }
  if (params.get("reset") === "1") { status.textContent = "Password updated. Sign in with your new password."; status.dataset.state = "success"; }

  /* already signed in? skip the form */
  window.addEventListener("lunde:customer", function () {
    if (L.currentCustomer && L.currentCustomer()) location.href = nextUrl();
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = ""; status.dataset.state = "";
    var email = String(form.elements.email.value || "").trim();
    var password = String(form.elements.password.value || "");
    if (!email || !password) { status.textContent = "Enter your email and password."; status.dataset.state = "error"; return; }
    submit.disabled = true; submit.textContent = "Signing in…";
    var r = null;
    try { r = await L.signInCustomer(email, password); } catch (err) { r = { ok: false, error: "Something went wrong. Try again." }; }
    if (r && r.ok) { location.href = nextUrl(); return; }
    if (r && r.code === "email_unverified") {
      resendEmail = r.email || email;
      status.innerHTML = ((r && r.error) || "Please verify your email before signing in.") + ' <button class="link-button" type="button" id="resendVerify">Resend verification email</button>';
      var resend = document.getElementById("resendVerify");
      if (resend) resend.addEventListener("click", async function () {
        resend.disabled = true;
        var out = await L.resendVerificationEmail(resendEmail);
        status.innerHTML = "If that account needs verification, we sent a new link." + (out && out.devVerificationUrl ? '<br><a href="' + out.devVerificationUrl + '">Open local verification link</a>' : "");
        status.dataset.state = "success";
      });
    } else {
      status.textContent = (r && r.error) || "Email or password did not match.";
    }
    status.dataset.state = "error";
    submit.disabled = false; submit.textContent = "Sign in";
  });
})();
