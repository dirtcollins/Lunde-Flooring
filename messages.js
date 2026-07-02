/* Lunde V6/V7 — staff messages (feedback inbox) */
(function () {
  var L = window.lunde;
  var state = { filter: "open", topic: "all", q: "", replyOpen: {} };
  var chipsEl = document.getElementById("msgChips"), topicsEl = document.getElementById("msgTopics"), listEl = document.getElementById("msgList");
  var searchEl = document.getElementById("msgSearch"), refreshBtn = document.getElementById("msgRefresh");

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function escAttr(v) { return esc(v).replace(/"/g, "&quot;"); }
  function ago(ts) { if (!ts) return ""; var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }

  function items() { return (L.feedbackItems ? L.feedbackItems() : []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }); }
  function itemById(id) { return items().find(function (x) { return x.id === id; }); }

  function matchesTopic(f) { return state.topic === "all" || String(f.topic || "").trim() === state.topic; }
  function matchesQuery(f) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return [f.name, f.email, f.phone, f.message, f.about, f.topic].some(function (v) {
      return String(v || "").toLowerCase().indexOf(q) !== -1;
    });
  }
  function baseFiltered() { return items().filter(matchesTopic).filter(matchesQuery); }
  function filtered() {
    var all = baseFiltered();
    if (state.filter === "open") return all.filter(function (f) { return f.status !== "resolved"; });
    if (state.filter === "resolved") return all.filter(function (f) { return f.status === "resolved"; });
    return all;
  }

  /* Match a message to a customer record by email (case-insensitive). */
  function customerFor(f) {
    if (!f.email || !L.customers) return null;
    var em = String(f.email).toLowerCase();
    return (L.customers() || []).find(function (c) { return String(c.email || "").toLowerCase() === em; }) || null;
  }

  /* Contact-form submissions store the whole summary in `message`
     (topic header + trailing name/email/phone block). We render those
     structurally, so trim the boilerplate from the body when present. */
  function displayMessage(f) {
    var m = String(f.message || "");
    if (f.kind === "contact" && f.topic) {
      m = m.replace(/^Contact form — [^\n]*\n+/, "");
      m = m.replace(/\n+— [^\n]*\nEmail: [\s\S]*$/, "");
    }
    return m.trim() || String(f.message || "");
  }

  function renderChips() {
    var all = baseFiltered();
    var open = all.filter(function (f) { return f.status !== "resolved"; }).length;
    var res = all.length - open;
    chipsEl.innerHTML = [["open", "Open", open], ["resolved", "Resolved", res], ["all", "All", all.length]].map(function (f) {
      return '<button class="chip" type="button" data-filter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] + ' <b>' + f[2] + '</b></button>';
    }).join("");
  }

  function renderTopics() {
    var tps = [];
    items().forEach(function (f) { var t = String(f.topic || "").trim(); if (t && tps.indexOf(t) === -1) tps.push(t); });
    tps.sort();
    if (!tps.length) { topicsEl.innerHTML = ""; topicsEl.hidden = true; if (state.topic !== "all") state.topic = "all"; return; }
    if (state.topic !== "all" && tps.indexOf(state.topic) === -1) state.topic = "all";
    topicsEl.hidden = false;
    topicsEl.innerHTML = [["all", "All topics"]].concat(tps.map(function (t) { return [t, t]; })).map(function (t) {
      return '<button class="chip" type="button" data-topic="' + escAttr(t[0]) + '" aria-pressed="' + (state.topic === t[0]) + '">' + esc(t[1]) + '</button>';
    }).join("");
  }

  function photosHtml(f) {
    var ph = Array.isArray(f.photos) ? f.photos : [];
    if (!ph.length) return "";
    return '<div class="msg-photos">' + ph.map(function (src, i) {
      return '<button class="msg-photo" type="button" data-photo-id="' + escAttr(f.id) + '" data-photo-i="' + i + '" aria-label="Open photo ' + (i + 1) + ' full size">' +
        '<img src="' + escAttr(src) + '" alt="Customer photo ' + (i + 1) + '" loading="lazy"></button>';
    }).join("") + "</div>";
  }

  function repliesHtml(f) {
    var reps = Array.isArray(f.replies) ? f.replies : [];
    if (!reps.length) return "";
    return '<div class="msg-replies">' + reps.map(function (r) {
      return '<div class="msg-reply"><span class="row-sub">Reply · ' + esc(r.author || "Staff") + (r.at ? ' · ' + ago(r.at) : '') + '</span><p>' + esc(r.message) + '</p></div>';
    }).join("") + "</div>";
  }

  function replyBoxHtml(f) {
    if (!state.replyOpen[f.id]) return "";
    return '<div class="msg-replybox">' +
      '<textarea rows="3" data-reply-text="' + escAttr(f.id) + '" placeholder="Write a reply — it emails ' + escAttr(f.email) + ' and is saved on this message…"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn" type="button" data-reply-send="' + escAttr(f.id) + '" style="min-height:38px">Send reply</button>' +
        '<button class="btn ghost" type="button" data-reply-cancel="' + escAttr(f.id) + '" style="min-height:38px">Cancel</button>' +
      '</div></div>';
  }

  function metaHtml(f) {
    var bits = [];
    if (f.source === "staff") {
      bits.push((f.about ? esc(f.about) + ' · ' : '') + 'Logged by ' + esc(f.name || "staff"));
    } else {
      bits.push(f.name ? esc(f.name) : "Anonymous");
      if (f.email) bits.push('<a href="mailto:' + escAttr(f.email) + '">' + esc(f.email) + '</a>');
      if (f.phone) bits.push('<a href="tel:' + escAttr(String(f.phone).replace(/[^\d+]/g, "")) + '">' + esc(f.phone) + '</a>');
      var cust = customerFor(f);
      if (cust) bits.push('<a href="./customer-profile.html?id=' + encodeURIComponent(cust.email || cust.id) + '">View customer</a>');
      if (f.page && f.kind !== "contact") bits.push(esc(f.page));
    }
    if (f.createdAt) bits.push(ago(f.createdAt));
    var html = '<span class="row-sub msg-meta">' + bits.join(" · ") + '</span>';
    if (f.source !== "staff" && !f.email && f.phone) {
      html += '<span class="msg-hint">No email on this message — call or text <a href="tel:' + escAttr(String(f.phone).replace(/[^\d+]/g, "")) + '">' + esc(f.phone) + '</a> to follow up.</span>';
    }
    return html;
  }

  function render() {
    /* keep in-progress reply drafts across re-renders */
    var drafts = {};
    listEl.querySelectorAll("[data-reply-text]").forEach(function (t) { if (t.value) drafts[t.getAttribute("data-reply-text")] = t.value; });

    var msgs = filtered();
    listEl.innerHTML = msgs.length ? msgs.map(function (f) {
      var resolved = f.status === "resolved";
      var badges = (f.source === "staff" ? '<span class="status-badge" data-status="placed" style="margin-right:8px;vertical-align:2px"><i></i>Staff note</span>' : '') +
        (f.topic ? '<span class="msg-topic">' + esc(f.topic) + '</span>' : '');
      return '<div class="row msg-row" style="grid-template-columns:1fr auto;align-items:flex-start;gap:16px">' +
        '<div style="min-width:0">' +
          (badges ? '<div>' + badges + '</div>' : '') +
          '<p class="msg-body">' + esc(displayMessage(f)) + '</p>' +
          photosHtml(f) +
          repliesHtml(f) +
          metaHtml(f) +
          replyBoxHtml(f) +
        '</div>' +
        '<div class="msg-actions">' +
          '<span class="status-badge" data-status="' + (resolved ? "delivered" : "shipped") + '"><i></i>' + (resolved ? "Resolved" : "Open") + '</span>' +
          (f.email && L.replyToFeedback ? '<button class="chip" type="button" data-reply="' + escAttr(f.id) + '" aria-pressed="' + Boolean(state.replyOpen[f.id]) + '" style="height:34px;padding:0 12px">Reply</button>' : '') +
          '<button class="chip" type="button" data-resolve="' + escAttr(f.id) + '" style="height:34px;padding:0 12px">' + (resolved ? "Reopen" : "Resolve") + '</button>' +
          '<button class="chip" type="button" data-del="' + escAttr(f.id) + '" style="height:34px;padding:0 12px">Delete</button>' +
        '</div></div>';
    }).join("") : '<div class="app-empty"><h3>No messages</h3><p>' + (state.q || state.topic !== "all" ? "Nothing matches this search or topic filter." : "Customer feedback will show up here.") + '</p></div>';

    Object.keys(drafts).forEach(function (id) {
      var t = listEl.querySelector('[data-reply-text="' + id.replace(/"/g, '\\"') + '"]');
      if (t) t.value = drafts[id];
    });
  }
  function renderAll() { renderChips(); renderTopics(); render(); }

  /* Data-URL images can't be opened as a top-level tab directly in most
     browsers, so open a blank tab and place the image inside it. */
  function openPhoto(id, i) {
    var f = itemById(id);
    var src = f && Array.isArray(f.photos) ? f.photos[i] : null;
    if (!src) return;
    var w = window.open("", "_blank");
    if (!w) { if (L.showToast) L.showToast("Allow pop-ups to open photos full size"); return; }
    w.document.write('<!doctype html><title>Photo — Lunde Messages</title>' +
      '<body style="margin:0;background:#141414;min-height:100vh;display:grid;place-items:center">' +
      '<img src="' + escAttr(src) + '" alt="Customer photo" style="max-width:100vw;max-height:100vh;display:block">');
    w.document.close();
  }

  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (!b) return; state.filter = b.dataset.filter; renderChips(); render(); });
  topicsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-topic]"); if (!b) return; state.topic = b.dataset.topic; renderAll(); });
  searchEl.addEventListener("input", function () { state.q = searchEl.value.trim(); renderChips(); render(); });

  listEl.addEventListener("click", async function (e) {
    var pv = e.target.closest("[data-photo-id]");
    if (pv) { openPhoto(pv.getAttribute("data-photo-id"), Number(pv.getAttribute("data-photo-i"))); return; }
    var rt = e.target.closest("[data-reply]");
    if (rt) {
      var rid = rt.getAttribute("data-reply");
      state.replyOpen[rid] = !state.replyOpen[rid];
      render();
      if (state.replyOpen[rid]) { var box = listEl.querySelector('[data-reply-text="' + rid.replace(/"/g, '\\"') + '"]'); if (box) box.focus(); }
      return;
    }
    var rc = e.target.closest("[data-reply-cancel]");
    if (rc) { delete state.replyOpen[rc.getAttribute("data-reply-cancel")]; render(); return; }
    var rs = e.target.closest("[data-reply-send]");
    if (rs) {
      var sid = rs.getAttribute("data-reply-send");
      var ta = listEl.querySelector('[data-reply-text="' + sid.replace(/"/g, '\\"') + '"]');
      var text = ta ? ta.value.trim() : "";
      if (!text) { if (L.showToast) L.showToast("Write the reply first"); if (ta) ta.focus(); return; }
      rs.disabled = true; rs.textContent = "Sending…";
      var res = await L.replyToFeedback(sid, text);
      if (res && res.ok) {
        delete state.replyOpen[sid];
        if (L.showToast) L.showToast("Reply sent by email");
        renderAll();
      } else {
        rs.disabled = false; rs.textContent = "Send reply";
        if (L.showToast) L.showToast(res && res.error ? res.error : "Could not send the reply.");
      }
      return;
    }
    var r = e.target.closest("[data-resolve]");
    if (r && L.updateFeedback) { var cur = itemById(r.dataset.resolve); await L.updateFeedback(r.dataset.resolve, { status: cur && cur.status === "resolved" ? "open" : "resolved" }); renderAll(); return; }
    var d = e.target.closest("[data-del]");
    if (d && L.deleteFeedback && confirm("Delete this message?")) { delete state.replyOpen[d.dataset.del]; await L.deleteFeedback(d.dataset.del); renderAll(); }
  });

  /* staff-composed messages (phone calls, walk-ins, team notes) — modal */
  var composer = document.getElementById("msgComposer");
  var addToggle = document.getElementById("msgAddToggle");
  function composerOpen(open) {
    composer.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open) document.getElementById("msgText").focus();
  }
  addToggle.addEventListener("click", function () { composerOpen(composer.hidden); });
  document.getElementById("msgCancel").addEventListener("click", function () { composerOpen(false); });
  document.getElementById("msgComposerX").addEventListener("click", function () { composerOpen(false); });
  document.getElementById("msgComposerScrim").addEventListener("click", function () { composerOpen(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !composer.hidden) composerOpen(false);
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
    composerOpen(false);
    if (L.showToast) L.showToast("Message added to the inbox");
    // addFeedback only writes the local cache when the server is unreachable —
    // pull the fresh list so the new message shows immediately either way.
    if (L.refreshFeedback) await L.refreshFeedback();
    renderAll();
  });

  refreshBtn.addEventListener("click", async function () {
    refreshBtn.disabled = true; refreshBtn.textContent = "Refreshing…";
    try { if (L.refreshFeedback) await L.refreshFeedback(); } finally { refreshBtn.disabled = false; refreshBtn.textContent = "Refresh"; }
    renderAll();
  });

  /* True while staff are mid-edit — don't clobber their typing on a sync. */
  function midEdit() {
    var t = document.getElementById("msgText"), w = document.getElementById("msgWho");
    if ((t && t.value.trim()) || (w && w.value.trim())) return true;
    var boxes = listEl.querySelectorAll("[data-reply-text]");
    for (var i = 0; i < boxes.length; i++) { if (boxes[i].value.trim()) return true; }
    return false;
  }
  document.addEventListener("lunde:synced", function () { if (!midEdit()) renderAll(); });

  if (L.refreshFeedback) { L.refreshFeedback().then(function () { renderAll(); }); }
  renderAll();
})();
