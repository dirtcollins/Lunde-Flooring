/* Lunde V7 — staff account management (Owner-only). Server enforces all rules;
   this UI surfaces them. */
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
  var editing = null;   // null | "new" | userId
  var busy = false;

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

  function userRow(u) {
    var self = u.id === session.id;
    var actions =
      '<button class="btn ghost" type="button" data-edit="' + u.id + '" style="min-height:36px;padding:6px 12px">Edit</button>' +
      '<button class="btn ghost" type="button" data-toggle="' + u.id + '" style="min-height:36px;padding:6px 12px"' + (self ? ' disabled title="You can\'t deactivate your own account"' : '') + '>' + (u.active ? "Deactivate" : "Activate") + '</button>' +
      '<button class="btn ghost" type="button" data-remove="' + u.id + '" style="min-height:36px;padding:6px 12px;color:#b4322a"' + (self ? ' disabled title="You can\'t remove your own account"' : '') + '>Remove</button>';
    return '<div class="row" style="grid-template-columns:1fr auto;gap:12px 16px;align-items:center;flex-wrap:wrap">' +
        '<span style="min-width:0"><span class="row-title">' + esc(u.name) + (self ? ' <span class="row-sub">(you)</span>' : '') + '</span>' +
        '<span class="row-sub" style="display:block;word-break:break-all">' + esc(u.email) + '</span></span>' +
        '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">' + roleBadge(u.role) + statusBadge(u.active) + '</span>' +
        '<span style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap">' + actions + '</span>' +
      '</div>';
  }

  function roleOptions(selected) {
    return ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === selected ? ' selected' : '') + '>' + r + '</option>';
    }).join("");
  }

  function formPanel() {
    var creating = editing === "new";
    var u = creating ? { name: "", email: "", role: "Staff", active: true } : (users.filter(function (x) { return x.id === editing; })[0] || null);
    if (!u) return "";
    var self = !creating && u.id === session.id;
    return '<div class="panel" id="staffForm"><div class="panel-head"><h2>' + (creating ? "Add staff account" : "Edit " + esc(u.name)) + '</h2></div>' +
      '<div class="panel-pad v6-form">' +
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

  function render() {
    var list = busy && !users.length
      ? '<div class="panel"><div class="panel-pad"><p class="row-sub">Loading…</p></div></div>'
      : '<div class="panel"><div class="panel-head"><h2>Staff accounts</h2><span class="row-sub">' + users.length + (users.length === 1 ? " account" : " accounts") + '</span></div>' +
        '<div class="rowlist">' + (users.map(userRow).join("") || '<div class="panel-pad"><p class="row-sub">No staff accounts yet.</p></div>') + '</div></div>';

    mount.innerHTML =
      '<div class="app-head"><div><p class="eyebrow">Team</p><h1>Staff accounts</h1></div>' +
        (editing ? "" : '<button class="btn" type="button" id="addBtn" style="min-height:42px">Add staff account</button>') +
      '</div>' +
      (editing ? formPanel() : "") +
      list;

    wire();
  }

  function wire() {
    var add = document.getElementById("addBtn");
    if (add) add.addEventListener("click", function () { editing = "new"; render(); });

    [].forEach.call(mount.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function () { editing = b.getAttribute("data-edit"); render(); });
    });
    [].forEach.call(mount.querySelectorAll("[data-toggle]"), function (b) {
      b.addEventListener("click", function () { toggleActive(b.getAttribute("data-toggle")); });
    });
    [].forEach.call(mount.querySelectorAll("[data-remove]"), function (b) {
      b.addEventListener("click", function () { removeUser(b.getAttribute("data-remove")); });
    });

    var role = document.getElementById("fRole"), note = document.getElementById("fRoleNote");
    if (role && note) role.addEventListener("change", function () { note.textContent = ROLE_NOTE[role.value] || ""; });
    var save = document.getElementById("fSave");
    if (save) save.addEventListener("click", submitForm);
    var cancel = document.getElementById("fCancel");
    if (cancel) cancel.addEventListener("click", function () { editing = null; render(); });
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
        editing = null;
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
      L.adminUserUpdate(editing, patch).then(done);
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
