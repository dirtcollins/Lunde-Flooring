/* Lunde V7 — staff account management (Owner-only). Server enforces all rules;
   this UI surfaces them. Add/Edit use a modal dialog (styles in staff-users.html). */
(function () {
  var L = window.lunde;
  var mount = document.getElementById("staffMount");
  var session = window.lundeSession || {};
  var ROLES = ["Owner", "Manager", "Staff"];
  var ROLE_NOTE = {
    Owner: "Full access, including managing staff accounts.",
    Manager: "Console access. Cannot manage staff accounts.",
    Staff: "Console access. Cannot manage staff accounts."
  };

  var users = [];
  var editing = null;      // null | "new" | userId
  var busy = false;
  var modalEl = null;      // the scrim element while the dialog is open
  var avatarDraft = null;  // null = unchanged | "" = remove | "data:image/jpeg;…" = new photo

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isOwner() { return session.role === "Owner" || session.canManageAdmins; }
  function toast(msg) { if (L.showToast) L.showToast(msg); }

  if (!isOwner()) {
    mount.innerHTML =
      '<div class="app-head"><div><p class="eyebrow">Access</p><h1>Staff accounts</h1></div></div>' +
      '<div class="panel"><div class="panel-pad"><p class="row-sub">You need Owner access to manage staff accounts.</p></div></div>';
    return;
  }

  function load() {
    busy = true; render();
    L.adminUsersList().then(function (res) {
      busy = false;
      if (res && res.ok && Array.isArray(res.users)) { users = res.users; }
      else { toast((res && res.error) || "Could not load staff accounts."); }
      render();
    });
  }

  function roleBadge(role) {
    var status = role === "Owner" ? "delivered" : "processing";
    return '<span class="status-badge" data-status="' + status + '"><i></i>' + esc(role) + '</span>';
  }
  function statusBadge(active) {
    return active
      ? '<span class="status-badge" data-status="delivered"><i></i>Active</span>'
      : '<span class="status-badge" data-status="cancelled"><i></i>Inactive</span>';
  }

  function initialsOf(u) {
    return (u.initials || (u.name || u.email || "?").split(" ").map(function (w) { return w[0]; }).join("")).slice(0, 2).toUpperCase();
  }
  function joined(u) {
    if (!u.createdAt) return "";
    var d = new Date(u.createdAt);
    return isNaN(d) ? "" : "Added " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function avSpan(u) {
    var base = 'width:44px;height:44px;border-radius:999px;display:grid;place-items:center;font-size:14px;font-weight:700;';
    if (u.avatar) {
      return '<span class="av" style="' + base + 'background-color:var(--stone);background-image:url(' + esc(u.avatar) + ');background-size:cover;background-position:center"></span>';
    }
    return '<span class="av" style="' + base + 'background:' + (u.active ? "var(--accent)" : "var(--stone)") + ';color:' + (u.active ? "#fff" : "var(--muted)") + '">' + esc(initialsOf(u)) + '</span>';
  }
  function userRow(u) {
    var self = u.id === session.id;
    var meta = [joined(u), self ? "This is you" : ""].filter(Boolean).join(" · ");
    var actions =
      '<button class="btn ghost" type="button" data-edit="' + u.id + '" style="min-height:36px;padding:6px 12px">Edit</button>' +
      '<button class="btn ghost" type="button" data-toggle="' + u.id + '" style="min-height:36px;padding:6px 12px"' + (self ? ' disabled title="You can\'t deactivate your own account"' : '') + '>' + (u.active ? "Deactivate" : "Activate") + '</button>' +
      '<button class="btn ghost" type="button" data-remove="' + u.id + '" style="min-height:36px;padding:6px 12px;color:#b4322a"' + (self ? ' disabled title="You can\'t remove your own account"' : '') + '>Remove</button>';
    return '<div class="row" style="grid-template-columns:44px 1fr auto;gap:12px 14px;align-items:center;flex-wrap:wrap">' +
        avSpan(u) +
        '<span style="min-width:0"><span class="row-title">' + esc(u.name) + '</span>' +
        '<span class="row-sub" style="display:block;word-break:break-all">' + esc(u.email) + (meta ? ' · ' + meta : '') + '</span></span>' +
        '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">' + roleBadge(u.role) + statusBadge(u.active) + '</span>' +
        '<span style="grid-column:2/-1;display:flex;gap:8px;flex-wrap:wrap">' + actions + '</span>' +
      '</div>';
  }

  function roleOptions(selected) {
    return ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === selected ? ' selected' : '') + '>' + r + '</option>';
    }).join("");
  }

  /* ---------- modal dialog (add / edit) ---------- */

  function avatarSection(u) {
    var prev = u.avatar
      ? '<span class="av" id="fAvPrev" style="background-image:url(' + esc(u.avatar) + ')"></span>'
      : '<span class="av" id="fAvPrev">' + esc(initialsOf(u)) + '</span>';
    return '<div class="su-ava">' + prev +
      '<div class="su-ava-btns">' +
        '<button class="btn ghost" type="button" id="fAvUpload" style="min-height:36px;padding:6px 12px">Upload photo</button>' +
        '<button class="btn ghost" type="button" id="fAvRemove" style="min-height:36px;padding:6px 12px"' + (u.avatar ? '' : ' disabled') + '>Remove photo</button>' +
        '<input type="file" id="fAvFile" accept="image/png,image/jpeg,image/webp" style="display:none">' +
      '</div></div>';
  }

  function modalHtml() {
    var creating = editing === "new";
    var u = creating ? { name: "", email: "", role: "Staff", active: true } : (users.filter(function (x) { return x.id === editing; })[0] || null);
    if (!u) return "";
    var self = !creating && u.id === session.id;
    return '<div class="su-modal" role="dialog" aria-modal="true" aria-label="' + (creating ? "Add staff account" : "Edit staff account") + '">' +
      '<div class="su-modal-head"><h2>' + (creating ? "Add staff account" : "Edit " + esc(u.name)) + '</h2>' +
        '<button class="su-x" type="button" id="fClose" aria-label="Close">&times;</button></div>' +
      '<div class="su-modal-body v6-form">' +
        (creating ? "" : avatarSection(u)) +
        '<div class="v6-field-row">' +
          '<label class="v6-field"><span>Name</span><input id="fName" type="text" value="' + esc(u.name) + '" placeholder="Full name" autocomplete="off"></label>' +
          '<label class="v6-field"><span>Email</span><input id="fEmail" type="email" value="' + esc(u.email) + '" placeholder="name@company.com" autocomplete="off"></label>' +
        '</div>' +
        '<div class="v6-field-row">' +
          '<label class="v6-field"><span>Role</span><select id="fRole"' + (self ? ' disabled title="You can\'t change your own role"' : '') + '>' + roleOptions(u.role) + '</select></label>' +
          '<label class="v6-field"><span>' + (creating ? "Password" : "New password") + '</span><input id="fPassword" type="password" value="" placeholder="' + (creating ? "At least 8 characters" : "Leave blank to keep current") + '" autocomplete="new-password"></label>' +
        '</div>' +
        '<p class="row-sub" id="fRoleNote" style="margin:-4px 0 8px">' + esc(ROLE_NOTE[u.role] || "") + '</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<button class="btn" type="button" id="fSave" style="min-height:42px">' + (creating ? "Create account" : "Save changes") + '</button>' +
          '<button class="btn ghost" type="button" id="fCancel" style="min-height:42px">Cancel</button>' +
          '<span class="row-sub" id="fStatus" style="color:#b4322a"></span>' +
        '</div>' +
      '</div></div>';
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); closeModal(); }
  }

  function openModal(id) {
    closeModal();
    editing = id;
    avatarDraft = null;
    var html = modalHtml();
    if (!html) { editing = null; return; }
    modalEl = document.createElement("div");
    modalEl.className = "su-scrim";
    modalEl.innerHTML = html;
    document.body.appendChild(modalEl);
    document.body.classList.add("su-modal-open");
    document.addEventListener("keydown", onModalKeydown);
    wireModal();
    var first = document.getElementById("fName");
    if (first) first.focus();
  }

  function closeModal() {
    if (!modalEl) return;
    if (modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    editing = null;
    avatarDraft = null;
    document.body.classList.remove("su-modal-open");
    document.removeEventListener("keydown", onModalKeydown);
  }

  /* Center-crop + downscale a picked image to a 128x128 JPEG data URL. */
  function downscaleAvatar(file, cb) {
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { cb(""); return; }
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      try {
        var size = 128;
        var c = document.createElement("canvas");
        c.width = size; c.height = size;
        var ctx = c.getContext("2d");
        var s = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
        if (!s) { cb(""); return; }
        var sx = ((img.naturalWidth || img.width) - s) / 2;
        var sy = ((img.naturalHeight || img.height) - s) / 2;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        var out = c.toDataURL("image/jpeg", 0.85);
        cb(out && out.indexOf("data:image/jpeg") === 0 ? out : "");
      } catch (e2) { cb(""); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(""); };
    img.src = url;
  }

  function setAvatarPreview(dataUrl, fallbackInitials) {
    var prev = document.getElementById("fAvPrev");
    var remove = document.getElementById("fAvRemove");
    if (!prev) return;
    if (dataUrl) {
      prev.style.backgroundImage = "url(" + dataUrl + ")";
      prev.textContent = "";
      if (remove) remove.disabled = false;
    } else {
      prev.style.backgroundImage = "";
      prev.textContent = fallbackInitials || "?";
      if (remove) remove.disabled = true;
    }
  }

  function wireModal() {
    var u = users.filter(function (x) { return x.id === editing; })[0] || {};
    var scrim = modalEl;
    scrim.addEventListener("mousedown", function (e) {
      if (e.target === scrim) closeModal();
    });
    var close = document.getElementById("fClose");
    if (close) close.addEventListener("click", closeModal);
    var cancel = document.getElementById("fCancel");
    if (cancel) cancel.addEventListener("click", closeModal);

    var role = document.getElementById("fRole"), note = document.getElementById("fRoleNote");
    if (role && note) role.addEventListener("change", function () { note.textContent = ROLE_NOTE[role.value] || ""; });
    var save = document.getElementById("fSave");
    if (save) save.addEventListener("click", submitForm);

    // Avatar uploader (edit mode only)
    var avBtn = document.getElementById("fAvUpload");
    var avFile = document.getElementById("fAvFile");
    var avRemove = document.getElementById("fAvRemove");
    if (avBtn && avFile) {
      avBtn.addEventListener("click", function () { avFile.click(); });
      avFile.addEventListener("change", function () {
        var f = avFile.files && avFile.files[0];
        avFile.value = "";
        if (!f) return;
        downscaleAvatar(f, function (dataUrl) {
          if (!dataUrl) { toast("Could not read that image."); return; }
          avatarDraft = dataUrl;
          setAvatarPreview(dataUrl, initialsOf(u));
        });
      });
    }
    if (avRemove) {
      avRemove.addEventListener("click", function () {
        avatarDraft = "";
        setAvatarPreview("", initialsOf(u));
      });
    }
  }

  function render() {
    var list = busy && !users.length
      ? '<div class="panel"><div class="panel-pad"><p class="row-sub">Loading…</p></div></div>'
      : '<div class="panel"><div class="panel-head"><h2>Staff accounts</h2><span class="row-sub">' + users.length + (users.length === 1 ? " account" : " accounts") + '</span></div>' +
        '<div class="rowlist">' + (users.map(userRow).join("") || '<div class="panel-pad"><p class="row-sub">No staff accounts yet.</p></div>') + '</div></div>';

    mount.innerHTML =
      '<div class="app-head"><div><p class="eyebrow">Team</p><h1>Staff accounts</h1><p>Owners manage accounts; Managers and Staff get full console access without account management.</p></div>' +
        '<button class="btn" type="button" id="addBtn" style="min-height:42px">Add staff account</button>' +
      '</div>' +
      list;

    wire();
  }

  function wire() {
    var add = document.getElementById("addBtn");
    if (add) add.addEventListener("click", function () { openModal("new"); });

    [].forEach.call(mount.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function () { openModal(b.getAttribute("data-edit")); });
    });
    [].forEach.call(mount.querySelectorAll("[data-toggle]"), function (b) {
      b.addEventListener("click", function () { toggleActive(b.getAttribute("data-toggle")); });
    });
    [].forEach.call(mount.querySelectorAll("[data-remove]"), function (b) {
      b.addEventListener("click", function () { removeUser(b.getAttribute("data-remove")); });
    });
  }

  function submitForm() {
    if (busy) return;
    var creating = editing === "new";
    var status = document.getElementById("fStatus");
    var name = document.getElementById("fName").value.trim();
    var email = document.getElementById("fEmail").value.trim().toLowerCase();
    var role = document.getElementById("fRole").value;
    var password = document.getElementById("fPassword").value;

    if (!email) { status.textContent = "Enter an email address."; return; }
    if (creating && password.length < 8) { status.textContent = "Password must be at least 8 characters."; return; }
    if (password && password.length < 8) { status.textContent = "Password must be at least 8 characters."; return; }
    status.textContent = "";
    busy = true;
    document.getElementById("fSave").disabled = true;

    var done = function (res) {
      busy = false;
      if (res && res.ok) {
        closeModal();
        toast(creating ? "Staff account created" : "Changes saved");
        load();
      } else {
        if (document.getElementById("fSave")) document.getElementById("fSave").disabled = false;
        if (document.getElementById("fStatus")) document.getElementById("fStatus").textContent = (res && res.error) || "Could not save.";
      }
    };

    if (creating) {
      L.adminUserCreate({ name: name, email: email, role: role, password: password, active: true }).then(done);
    } else {
      var patch = { name: name, email: email, role: role };
      if (password) patch.password = password;
      if (avatarDraft !== null) patch.avatar = avatarDraft;
      var editedId = editing;
      // If editing yourself, mirror an avatar change into the local session so
      // the sidebar photo stays in sync on the next page load.
      var mirrorAvatar = (editedId === session.id && avatarDraft !== null) ? avatarDraft : null;
      L.adminUserUpdate(editedId, patch).then(function (res) {
        if (res && res.ok && mirrorAvatar !== null) {
          session.avatar = mirrorAvatar;
          try {
            var raw = JSON.parse(localStorage.getItem("lunde_staff_session_v1") || "null");
            if (raw) { raw.avatar = mirrorAvatar; localStorage.setItem("lunde_staff_session_v1", JSON.stringify(raw)); }
          } catch (e) {}
        }
        done(res);
      });
    }
  }

  function toggleActive(id) {
    if (busy) return;
    var u = users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    busy = true;
    L.adminUserUpdate(id, { active: !u.active }).then(function (res) {
      busy = false;
      if (res && res.ok) { toast(u.active ? "Account deactivated" : "Account activated"); load(); }
      else { toast((res && res.error) || "Could not update account."); }
    });
  }

  function removeUser(id) {
    if (busy) return;
    var u = users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    if (!confirm('Remove "' + u.name + '" (' + u.email + ')? This cannot be undone.')) return;
    busy = true;
    L.adminUserDelete(id).then(function (res) {
      busy = false;
      if (res && res.ok) { toast("Staff account removed"); load(); }
      else { toast((res && res.error) || "Could not remove account."); }
    });
  }

  load();
})();
