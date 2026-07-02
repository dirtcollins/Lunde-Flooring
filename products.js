/* Lunde V6/V7 — staff products list */
(function () {
  var L = window.lunde, money = L.money;
  var state = { q: "", collection: "all" };
  var chipsEl = document.getElementById("prodChips"), tableEl = document.getElementById("prodTable");

  function collections() { return ["all"].concat(Array.from(new Set(L.products().map(function (p) { return p.collection; })))); }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return L.products().filter(function (p) {
      if (state.collection !== "all" && p.collection !== state.collection) return false;
      if (!q) return true;
      return (p.title + " " + p.sku + " " + p.collection + " " + p.color).toLowerCase().indexOf(q) > -1;
    });
  }
  function renderChips() {
    chipsEl.innerHTML = collections().map(function (c) {
      return '<button class="chip" type="button" data-coll="' + c + '" aria-pressed="' + (state.collection === c) + '">' + (c === "all" ? "All collections" : c.replace("AdoFloor ", "")) + '</button>';
    }).join("");
  }
  function render() {
    var items = rows();
    tableEl.innerHTML = '<div class="tbl-head" style="grid-template-columns:48px 1.6fr 1fr 0.9fr 0.7fr 0.5fr"><span></span><span>Floor</span><span>Collection</span><span>Price / sq. ft.</span><span>Carton</span><span></span></div>' +
      (items.length ? items.map(function (p) {
        return '<div class="tbl-row" style="grid-template-columns:48px 1.6fr 1fr 0.9fr 0.7fr 0.5fr">' +
          '<span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span>' +
          '<span><b>' + p.title + '</b><br><span class="row-sub">' + p.sku + ' · ' + p.color + '</span></span>' +
          '<span class="row-sub">' + p.collection.replace("AdoFloor ", "") + '</span>' +
          '<span class="tabnum" style="display:flex;align-items:center;gap:4px">$<input type="number" min="0.01" step="0.01" value="' + p.pricePerSqft + '" data-price="' + p.id + '" style="width:76px;height:36px;border:1px solid var(--line-2);background:var(--panel);padding:0 8px;font:inherit;font-variant-numeric:tabular-nums;outline:none;text-align:right" aria-label="Price per square foot for ' + p.title + '"></span>' +
          '<span class="tabnum" data-carton="' + p.id + '">' + money(L.cartonPrice(p)) + '</span>' +
          '<a href="./product-edit.html?id=' + p.id + '" style="text-align:right;color:var(--muted)">Edit ›</a></div>';
      }).join("") : '<div class="app-empty"><h3>No floors</h3></div>');
  }

  /* Inline price editing: type the new $/sq ft right in the list. Saved as a
     product override (overrides are retail — the global markup doesn't stack). */
  tableEl.addEventListener("change", function (e) {
    var input = e.target.closest("[data-price]");
    if (!input) return;
    var id = input.getAttribute("data-price");
    var value = Math.round(Number(input.value) * 100) / 100;
    var p = L.productById(id);
    if (!p || !isFinite(value) || value <= 0) {
      input.value = p ? p.pricePerSqft : "";
      if (L.showToast) L.showToast("Enter a price above zero");
      return;
    }
    L.updateProduct(id, { pricePerSqft: value });
    input.value = value;
    var updated = L.productById(id);
    var carton = tableEl.querySelector('[data-carton="' + id + '"]');
    if (carton && updated) carton.textContent = money(L.cartonPrice(updated));
    if (L.showToast) L.showToast(p.title + " now " + money(value) + "/sq ft");
  });
  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-coll]"); if (!b) return; state.collection = b.dataset.coll; renderChips(); render(); });
  document.getElementById("prodSearch").addEventListener("input", function () { state.q = this.value; render(); });
  renderChips(); render();
})();
