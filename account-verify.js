/* Lunde V6 — customer email verification */
(function () {
  var L = window.lunde || {};
  var params = new URLSearchParams(location.search);
  var token = params.get("token") || "";
  var status = document.getElementById("verifyStatus");
  var intro = document.getElementById("verifyIntro");
  var resendForm = document.getElementById("resendForm");
  var resendSubmit = document.getElementById("resendSubmit");

  function fail(message, email) {
    intro.textContent = "This verification link could not be used.";
    status.textContent = message || "Verification link is invalid or expired.";
    status.dataset.state = "error";
    resendForm.hidden = false;
    if (email) resendForm.elements.email.value = email;
  }

  async function verify() {
    if (!token) return fail("Verification token is missing.");
    var r = null;
    try { r = await L.verifyCustomerEmail(token); } catch (err) { r = { ok: false, error: "Something went wrong. Try again." }; }
    if (r && r.ok) {
      intro.textContent = "Your email is verified.";
      status.innerHTML = 'You can sign in now. <a href="/account/login?verified=1">Go to sign in</a>';
      status.dataset.state = "success";
      setTimeout(function () { location.href = "/account/login?verified=1"; }, 1200);
      return;
    }
    fail((r && r.error) || "Verification link is invalid or expired.", r && r.email);
  }

  resendForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    resendSubmit.disabled = true;
    var email = String(resendForm.elements.email.value || "").trim();
    var r = await L.resendVerificationEmail(email);
    status.innerHTML = "If that account needs verification, we sent a new link." + (r && r.devVerificationUrl ? '<br><a href="' + r.devVerificationUrl + '">Open local verification link</a>' : "");
    status.dataset.state = "success";
    resendSubmit.disabled = false;
  });

  verify();
})();
