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
    tableEl.innerHTML = '<div class="tbl-head" style="grid-template-columns:48px 1.6fr 1fr 0.7fr 0.7fr 0.5fr"><span></span><span>Floor</span><span>Collection</span><span>Sq.ft / sq. ft.</span><span>Carton</span><span></span></div>' +
      (items.length ? items.map(function (p) {
        return '<a class="tbl-row" href="./product-edit.html?id=' + p.id + '" style="grid-template-columns:48px 1.6fr 1fr 0.7fr 0.7fr 0.5fr">' +
          '<span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(p.mainImage) + '\')"></span>' +
          '<span><b>' + p.title + '</b><br><span class="row-sub">' + p.sku + ' · ' + p.color + '</span></span>' +
          '<span class="row-sub">' + p.collection.replace("AdoFloor ", "") + '</span>' +
          '<span class="tabnum">' + money(p.pricePerSqft) + '</span>' +
          '<span class="tabnum">' + money(L.cartonPrice(p)) + '</span>' +
          '<span style="text-align:right;color:var(--muted)">Edit ›</span></a>';
      }).join("") : '<div class="app-empty"><h3>No floors</h3></div>');
  }
  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-coll]"); if (!b) return; state.collection = b.dataset.coll; renderChips(); render(); });
  document.getElementById("prodSearch").addEventListener("input", function () { state.q = this.value; render(); });
  renderChips(); render();
})();
