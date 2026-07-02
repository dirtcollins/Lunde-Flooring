/* Lunde V7 — free sample box.
   - Pick up to MAX swatches; a 5th click shows a notice.
   - Selection persists in localStorage so it survives reload/navigation.
   - "Ship my free samples" opens a shipping form (prefilled for signed-in
     customers) and POSTs to /api/samples — no cart, no card. */
(function () {
  var L = window.lunde;
  var MAX = 4, KEY = "samples-selection";
  var page = document.querySelector(".samples-page");
  if (!page || !L) return;
  var grid = document.getElementById("sampleGrid");
  var form = document.getElementById("shipForm");
  var done = document.getElementById("shipDone");
  var shipBtn = document.getElementById("shipSamples");
  var statusEl = document.getElementById("shipStatus");

  function products() {
    return window.LUNDE_PUBLIC_PRODUCTS || L.products().filter(function (p) { return !p.archived; });
  }
  function read() {
    try {
      var sm = JSON.parse(localStorage.getItem(KEY) || "{}");
      return sm && typeof sm === "object" ? sm : {};
    } catch (e) { return {}; }
  }
  function write(sm) { localStorage.setItem(KEY, JSON.stringify(sm)); }
  function selected() {
    var known = {};
    products().forEach(function (p) { known[p.id] = 1; });
    return Object.keys(read()).filter(function (id) { return known[id]; });
  }

  var TICK = '<span class="tick" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg></span>';
  function card(p) {
    return '<button class="pcard scard" type="button" data-id="' + p.id + '" aria-pressed="false">' +
      '<span class="sw" style="background-image:url(\'' + L.img(p.mainImage) + '\')">' + TICK + '</span>' +
      '<span class="bd"><span class="nm">' + p.title + '</span><span class="tone">' + (p.color || p.collection) + '</span></span></button>';
  }
  function render() {
    var sm = read(), n = 0;
    page.querySelectorAll(".scard").forEach(function (c) {
      var on = !!sm[c.dataset.id]; if (on) n++;
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.getElementById("sampleCount").textContent = n;
  }

  grid.addEventListener("click", function (e) {
    var cardEl = e.target.closest(".scard");
    if (!cardEl) return;
    var sm = read(), id = cardEl.dataset.id;
    if (sm[id]) delete sm[id];
    else {
      if (selected().length >= MAX) { L.showToast("Sample box is full — " + MAX + " max"); return; }
      sm[id] = 1;
    }
    write(sm);
    render();
  });

  function msg(text) { statusEl.textContent = text || ""; }

  function prefill() {
    var f = form.elements;
    var c = L.currentCustomer();
    if (!c) return;
    if (!f.name.value) f.name.value = c.name || "";
    if (!f.email.value) f.email.value = c.email || "";
    if (!f.phone.value) f.phone.value = c.phone || "";
    if (!f.line1.value) {
      var addrs = L.myAddresses() || [];
      var a = addrs.find(function (x) { return x.isDefault; }) || addrs[0];
      if (a) {
        f.line1.value = a.line1 || "";
        f.city.value = a.city || "";
        if (a.state) f.state.value = a.state;
        f.zip.value = a.zip || "";
      }
    }
  }

  shipBtn.addEventListener("click", function () {
    if (!selected().length) { L.showToast("Pick at least one swatch first"); return; }
    if (!form.hidden) { form.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    prefill();
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    var first = Array.prototype.find.call(form.querySelectorAll("input"), function (i) { return !i.value; });
    if (first) first.focus({ preventScroll: true });
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = form.elements;
    var ids = selected();
    if (!ids.length) { msg("Pick at least one swatch above first."); return; }
    var name = f.name.value.trim();
    var email = f.email.value.trim();
    var line1 = f.line1.value.trim();
    var city = f.city.value.trim();
    var zip = f.zip.value.trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg("Add your name and a valid email."); return; }
    if (!line1 || !city || !zip) { msg("Add a full delivery address so we know where to ship."); return; }
    msg("");
    var btn = document.getElementById("shipSubmit");
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      var response = await fetch("./api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: ids,
          customer: { name: name, email: email, phone: f.phone.value.trim() },
          address: { line1: line1, city: city, state: f.state.value.trim(), zip: zip }
        })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Something went wrong — please try again.");
      // Cache the order locally so my-order.html can track it (guest orders
      // are looked up from this browser's copy, same as the checkout flow).
      if (data.item && L.saveOrder) L.saveOrder(data.item);
      write({});
      render();
      form.hidden = true;
      shipBtn.hidden = true;
      document.getElementById("doneCopy").textContent =
        "Order " + data.id + " — " + ids.length + (ids.length === 1 ? " swatch" : " swatches") +
        " headed to " + line1 + ". Ships free in 2–3 days, and we sent a confirmation to " + email + ".";
      document.getElementById("doneTrack").href = "./my-order.html?id=" + encodeURIComponent(data.id);
      done.hidden = false;
      done.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      msg(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send my sample box";
    }
  });

  /* address autocomplete on the street field — fills city/state/zip on select */
  if (window.lundeAddressAutocomplete && form.elements.line1) {
    window.lundeAddressAutocomplete(form.elements.line1, { onSelect: function (parts) {
      form.elements.line1.value = parts.line1;
      if (parts.city) form.elements.city.value = parts.city;
      if (parts.state) form.elements.state.value = parts.state;
      if (parts.zip) form.elements.zip.value = parts.zip;
    } });
  }

  grid.innerHTML = products().map(card).join("");
  render();
})();
