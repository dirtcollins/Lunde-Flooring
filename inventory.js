/* Lunde V6/V7 — staff inventory */
(function () {
  var L = window.lunde, money = L.money;
  var state = { filter: "all", q: "" };
  var chipsEl = document.getElementById("invChips"), tableEl = document.getElementById("invTable");

  function rows() {
    var q = state.q.trim().toLowerCase();
    return L.products().map(function (p) { return { p: p, info: L.stockInfo(p.id) }; })
      .filter(function (r) {
        if (state.filter === "low" && r.info.level !== "low") return false;
        if (state.filter === "out" && r.info.level !== "out") return false;
        if (state.filter === "in" && r.info.level !== "in") return false;
        if (!q) return true;
        return (r.p.title + " " + r.p.sku + " " + r.p.collection).toLowerCase().indexOf(q) > -1;
      });
  }
  function counts() { var c = { all: 0, in: 0, low: 0, out: 0 }; L.products().forEach(function (p) { c.all++; c[L.stockInfo(p.id).level]++; }); return c; }

  function renderChips() {
    var c = counts();
    chipsEl.innerHTML = [["all", "All"], ["in", "In stock"], ["low", "Low"], ["out", "Out"]].map(function (f) {
      return '<button class="chip" type="button" data-filter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] + ' <b>' + c[f[0]] + '</b></button>';
    }).join("");
  }
  function badge(info) {
    var st = info.level === "out" ? "cancelled" : info.level === "low" ? "shipped" : "delivered";
    var txt = info.level === "out" ? "Out of stock" : info.cartons + " cartons";
    return '<span class="status-badge" data-status="' + st + '"><i></i>' + txt + '</span>';
  }
  function render() {
    var items = rows();
    tableEl.innerHTML = '<div class="tbl-head" style="grid-template-columns:48px 1.6fr 1fr 0.8fr 150px"><span></span><span>Floor</span><span>Status</span><span>Carton price</span><span style="text-align:right">Set stock</span></div>' +
      (items.length ? items.map(function (r) {
        var title = r.p.archived ? (r.p.internalTitle || r.p.title) : r.p.title;
        var sub = r.p.archived ? "Archived laminate · hidden from website · " + r.p.sku : r.p.collection.replace("AdoFloor ", "") + " · " + r.p.sku + (r.p.internalTitle ? " · " + r.p.internalTitle : "");
        return '<div class="tbl-row" style="grid-template-columns:48px 1.6fr 1fr 0.8fr 150px">' +
          '<span class="row-thumb" style="width:48px;height:48px;background-image:url(\'' + window.lunde.thumb(r.p.mainImage) + '\')"></span>' +
          '<span><b>' + title + '</b><br><span class="row-sub">' + sub + '</span></span>' +
          '<span>' + badge(r.info) + '</span>' +
          '<span class="tabnum">' + money(L.cartonPrice(r.p)) + '</span>' +
          '<span style="display:flex;justify-content:flex-end"><input type="number" min="0" value="' + (r.info.cartons === 999 ? "" : r.info.cartons) + '" data-stock="' + r.p.id + '" placeholder="—" style="width:88px;height:40px;text-align:center;border:1px solid var(--line-2);font:inherit;outline:none;background:var(--panel)"></span>' +
        '</div>';
      }).join("") : '<div class="app-empty"><h3>No floors</h3></div>');
  }
  chipsEl.addEventListener("click", function (e) { var b = e.target.closest("[data-filter]"); if (!b) return; state.filter = b.dataset.filter; renderChips(); render(); });
  document.getElementById("invSearch").addEventListener("input", function () { state.q = this.value; render(); });
  tableEl.addEventListener("change", function (e) {
    var inp = e.target.closest("[data-stock]"); if (!inp) return;
    var v = inp.value === "" ? 999 : Math.max(0, parseInt(inp.value, 10) || 0);
    L.setStock(inp.dataset.stock, v);
    if (L.showToast) L.showToast("Stock updated");
    renderChips(); render();
  });
  renderChips(); render();
})();
