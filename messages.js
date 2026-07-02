/* Lunde V6/V7 — staff messages (feedback inbox) */
(function () {
  var L = window.lunde;
  var state = { filter: "open" };
  var chipsEl = document.getElementById("msgChips"), listEl = document.getElementById("msgList");

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function ago(ts) { if (!ts) return ""; var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }

  function items() { return (L.feedbackItems ? L.feedbackItems() : []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); }
  function filtered() {
    var all = items();
    if (state.filter === "open") return all.filter(function (f) { return f.status !== "resolved"; });
    if (state.filter === "resolved") return all.filter(function (f) { return f.status === "resolved"; });
    return all;
  }

  function renderChips() {
    var all = items();
    var open = all.filter(function (f) { return f.status !== "resolved"; }).length;
    var res = all.length - open;
    chipsEl.innerHTML = [["open", "Open", open], ["resolved", "Resolved", res], ["all", "All", all.length]].map(function (f) {
      return '<button class="chip" type="button" data-filter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] + ' <b>' + f[2] + '</b></button>';
    }).join("");
  }
  function render() {
    var msgs = filtered();
    listEl.innerHTML = msgs.length ? msgs.map(function (f) {
      var resolved = f.status === "resolved";
      var who = f.source === "staff"
        ? (f.about ? esc(f.about) + ' · ' : '') + 'Logged by ' + esc(f.name || "staff")
        : (f.name ? esc(f.name) : "Anonymous") + (f.email ? ' · ' + esc(f.email) : '');
      return '<div class="row" style="grid-template-columns:1fr auto;align-items:flex-start;gap:16px">' +
        '<div><p style="font-size:15px;line-height:1.5;margin-bottom:6px">' + (f.source === "staff" ? '<span class="status-badge" data-status="placed" style="margin-right:8px;vertical-align:2px"><i></i>Staff note</span>' : '') + esc(f.message) + '</p>' +
        '<span class="row-sub">' + who + (f.createdAt ? ' · ' + ago(f.createdAt) : '') + '</span></div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<span class="status-badge" data-status="' + (resolved ? "delivered" : "shipped") + '"><i></i>' + (resolved ? "Resolved" : "Open") + '</span>' +
          '<button class="chip" type="button" data-resolve="' + f.id + '" style="height:34px;padding:0 12px">' + (resolved ? "Reopen" : "Resolve") + '</button>' +
          '<button class="chip" type="button" data-del="' + f.id + '" style="height:34px;padding:0 12px">Delete</button>' +
        '</div></div>';
    }).join("") : '<div class="app-empty"><h3>No messages</h3><p>Customer feedback will show up here.</p></div>';
  }
  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (!b) return; state.filter = b.dataset.filter; renderChips(); render(); });
  listEl.addEventListener("click", async function (e) {
    var r = e.target.closest("[data-resolve]");
    if (r && L.updateFeedback) { var cur = items().find(function (x) { return x.id === r.dataset.resolve; }); await L.updateFeedback(r.dataset.resolve, { status: cur && cur.status === "resolved" ? "open" : "resolved" }); renderChips(); render(); return; }
    var d = e.target.closest("[data-del]");
    if (d && L.deleteFeedback && confirm("Delete this message?")) { await L.deleteFeedback(d.dataset.del); renderChips(); render(); }
  });
  /* staff-composed messages (phone calls, walk-ins, team notes) */
  var composer = document.getElementById("msgComposer");
  var addToggle = document.getElementById("msgAddToggle");
  addToggle.addEventListener("click", function () {
    composer.hidden = !composer.hidden;
    addToggle.textContent = composer.hidden ? "Add message" : "Close";
    if (!composer.hidden) document.getElementById("msgText").focus();
  });
  document.getElementById("msgCancel").addEventListener("click", function () {
    composer.hidden = true; addToggle.textContent = "Add message";
  });
  document.getElementById("msgSave").addEventListener("click", async function () {
    var text = document.getElementById("msgText").value.trim();
    if (!text) { if (L.showToast) L.showToast("Write the message first"); return; }
    var session = window.lundeSession || {};
    await L.addFeedback({
      message: text,
      source: "staff",
      name: session.name || "Staff",
      about: document.getElementById("msgWho").value.trim()
    });
    document.getElementById("msgText").value = "";
    document.getElementById("msgWho").value = "";
    composer.hidden = true; addToggle.textContent = "Add message";
    if (L.showToast) L.showToast("Message added to the inbox");
    // addFeedback only writes the local cache when the server is unreachable —
    // pull the fresh list so the new message shows immediately either way.
    if (L.refreshFeedback) await L.refreshFeedback();
    renderChips(); render();
  });

  if (L.refreshFeedback) { L.refreshFeedback().then(function () { renderChips(); render(); }); }
  renderChips(); render();
})();
