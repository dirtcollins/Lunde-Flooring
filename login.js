/* Lunde V6 — staff login (server-authoritative) */
(function () {
  var SESSION_KEY = "lunde_staff_session_v1";
  var LOGGED_OUT_KEY = "lunde_staff_logged_out_v1";
  var form = document.getElementById("loginForm");
  var status = document.getElementById("loginStatus");
  var submit = document.getElementById("loginSubmit");

  function nextUrl() {
    var next = new URLSearchParams(location.search).get("next");
    if (next && /^[\w.-]+\.html$/.test(next)) return "./" + next;
    return "./dashboard.html";
  }
  function signedIn(user) {
    var safe = {}; for (var k in user) if (k !== "password") safe[k] = user[k];
    localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    localStorage.removeItem(LOGGED_OUT_KEY);
    location.href = nextUrl();
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault(); status.textContent = ""; status.dataset.state = "";
    var email = String(form.elements.email.value || "").trim().toLowerCase();
    var password = String(form.elements.password.value || "");
    if (!email || !password) { status.textContent = "Enter your email and password."; status.dataset.state = "error"; return; }
    submit.disabled = true; submit.textContent = "Signing in…";
    var result = null;
    try { result = window.lunde.staffLogin ? await window.lunde.staffLogin(email, password) : null; } catch (err) { result = null; }
    if (result && result.ok && result.user) { signedIn(result.user); return; }
    status.textContent = (result && result.error) || "Email or password did not match.";
    status.dataset.state = "error";
    submit.disabled = false; submit.textContent = "Sign in";
  });
})();
