/* Lunde V6/V7 — staff reports (revenue trend, sales by collection & status,
   top customers, top floors, plus CSV export of all orders). */
(function () {
  var L = window.lunde, money = L.money, productById = L.productById,
      cartonsFor = L.cartonsFor, cartonPrice = L.cartonPrice,
      STATUS_LABELS = L.STATUS_LABELS, STATUSES = L.STATUSES;
  var mount = document.getElementById("rep");

  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function render() {
    var orders = L.orders();
    var live = orders.filter(function (o) { return o.status !== "cancelled"; });
    var revenue = live.reduce(function (s, o) { return s + (o.totals.total || 0); }, 0);
    var avg = live.length ? revenue / live.length : 0;
    var cancelled = orders.length - live.length;
    var cartonsSold = live.reduce(function (s, o) {
      return s + Object.keys(o.items).reduce(function (t, id) {
        var p = productById(id), e = o.items[id];
        return t + (p && e.sqft > 0 ? cartonsFor(p, e.sqft) : 0);
      }, 0);
    }, 0);

    /* revenue — last 6 months */
    var now = new Date(), buckets = [];
    for (var m = 5; m >= 0; m--) {
      var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      buckets.push({ key: d.getFullYear() + "-" + d.getMonth(), label: d.toLocaleDateString("en-US", { month: "short" }), value: 0, count: 0 });
    }
    var bmap = {}; buckets.forEach(function (b) { bmap[b.key] = b; });
    live.forEach(function (o) {
      var dd = new Date(o.createdAt), k = dd.getFullYear() + "-" + dd.getMonth();
      if (bmap[k]) { bmap[k].value += o.totals.total || 0; bmap[k].count++; }
    });
    var bMax = Math.max.apply(null, buckets.map(function (b) { return b.value; }).concat([1]));
    var sixTotal = buckets.reduce(function (s, b) { return s + b.value; }, 0);
    var chartBars = buckets.map(function (b) {
      var h = Math.max(2, Math.round(b.value / bMax * 100));
      return '<div class="repbar" title="' + b.label + ': ' + money(b.value) + ' · ' + b.count + ' orders">' +
        '<b>' + (b.value ? money(Math.round(b.value)) : "—") + '</b>' +
        '<span class="rb-fill' + (b.value ? "" : " is-zero") + '" style="height:' + h + '%"></span>' +
        '<small>' + b.label + '</small></div>';
    }).join("");

    /* orders by status */
    var byStatus = {}; orders.forEach(function (o) { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    var statusMax = Math.max.apply(null, Object.keys(byStatus).map(function (k) { return byStatus[k]; }).concat([1]));

    /* sales by collection */
    var byColl = {};
    live.forEach(function (o) {
      Object.keys(o.items).forEach(function (id) {
        var p = productById(id); if (!p) return;
        byColl[p.collection] = (byColl[p.collection] || 0) + L.materialEstimate(p, o.items[id].sqft || 0);
      });
    });
    var collRows = Object.keys(byColl).map(function (k) { return { k: k.replace("AdoFloor ", ""), v: byColl[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var collMax = Math.max.apply(null, collRows.map(function (r) { return r.v; }).concat([1]));

    /* top customers */
    var custTally = {};
    live.forEach(function (o) {
      var c = o.customer || {}, key = (c.email || c.name || "Guest").toLowerCase();
      custTally[key] = custTally[key] || { name: c.name || "Guest", company: c.company || "", value: 0, count: 0 };
      custTally[key].value += o.totals.total || 0; custTally[key].count++;
    });
    var topCust = Object.keys(custTally).map(function (k) { return custTally[k]; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 5);

    /* top floors by cartons */
    var byProd = {};
    live.forEach(function (o) { Object.keys(o.items).forEach(function (id) { var p = productById(id); if (!p) return; byProd[id] = (byProd[id] || 0) + cartonsFor(p, o.items[id].sqft || 0); }); });
    var topProd = Object.keys(byProd).map(function (id) { return { p: productById(id), c: byProd[id] }; }).filter(function (r) { return r.p; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 6);

    function bar(label, val, max, disp) {
      return '<div class="bar-row"><span class="lab">' + label + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(3, Math.round(val / max * 100)) + '%"></span></span><span class="val">' + disp + '</span></div>';
    }

    mount.innerHTML =
      '<div class="app-head"><div><p class="eyebrow">Analytics</p><h1>Reports</h1><p>Performance across all orders.</p></div>' +
        '<div class="rep-head-actions"><button class="btn ghost" type="button" id="exportCsv" style="min-height:44px">' + ic('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 19h16"/>') + 'Export CSV</button></div></div>' +
      '<div class="kpis">' +
        '<div class="kpi"><span class="kpi-ic" data-tone="green">' + ic('<path d="M4 20V4M4 20h16"/><path d="M7 14l4-4 3 3 5-6"/>') + '</span><span class="kpi-num">' + money(revenue) + '</span><span class="kpi-label">Total revenue</span></div>' +
        '<div class="kpi"><span class="kpi-ic" data-tone="blue">' + ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>') + '</span><span class="kpi-num">' + money(avg) + '</span><span class="kpi-label">Avg order value</span></div>' +
        '<div class="kpi"><span class="kpi-ic" data-tone="violet">' + ic('<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/>') + '</span><span class="kpi-num">' + cartonsSold.toLocaleString() + '</span><span class="kpi-label">Cartons sold</span></div>' +
        '<div class="kpi"><span class="kpi-ic" data-tone="amber">' + ic('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>') + '</span><span class="kpi-num">' + cancelled + '</span><span class="kpi-label">Cancelled</span></div>' +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h2>Revenue — last 6 months</h2><span class="row-strong" style="font-size:18px">' + money(sixTotal) + '</span></div><div class="panel-pad"><div class="repchart">' + chartBars + '</div></div></div>' +
      '<div class="cols-2-even" style="margin-top:18px">' +
        '<div class="panel"><div class="panel-head"><h2>Sales by collection</h2></div><div class="panel-pad"><div class="bars">' +
          (collRows.length ? collRows.map(function (r) { return bar(r.k, r.v, collMax, money(r.v)); }).join("") : '<p class="row-sub">No sales yet.</p>') + '</div></div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Orders by status</h2></div><div class="panel-pad"><div class="bars">' +
          STATUSES.concat(["cancelled"]).filter(function (s) { return byStatus[s]; }).map(function (s) { return bar(STATUS_LABELS[s], byStatus[s], statusMax, byStatus[s]); }).join("") + '</div></div></div>' +
      '</div>' +
      '<div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Site traffic — last 14 days</h2><span class="row-sub" id="trafficSummary">Loading…</span></div><div class="panel-pad" id="trafficPanel"><p class="row-sub">Counting storefront visits…</p></div></div>' +
      '<div class="cols-2-even" style="margin-top:18px">' +
        '<div class="panel"><div class="panel-head"><h2>Top customers</h2><a href="./customers.html">All →</a></div><div class="rep-custs">' +
          (topCust.length ? topCust.map(function (c, i) {
            return '<div class="rep-cust"><span class="rep-rank">' + (i + 1) + '</span><div class="rc-info"><b>' + esc(c.name) + '</b><span>' + esc(c.company || (c.count + " order" + (c.count === 1 ? "" : "s"))) + '</span></div><span class="rc-val">' + money(c.value) + '</span></div>';
          }).join("") : '<div class="app-empty"><p>No customers yet.</p></div>') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Top floors by cartons sold</h2></div><div class="rowlist">' +
          (topProd.length ? topProd.map(function (r) {
            return '<a class="row" href="./product-edit.html?id=' + r.p.id + '" style="grid-template-columns:44px 1fr auto"><span class="row-thumb" style="background-image:url(\'' + L.thumb(r.p.mainImage) + '\')"></span><span><span class="row-title">' + r.p.title + '</span><span class="row-sub">' + r.p.collection.replace("AdoFloor ", "") + '</span></span><span class="row-strong">' + r.c + ' cartons</span></a>';
          }).join("") : '<div class="app-empty"><p>No sales yet.</p></div>') + '</div></div>' +
      '</div>';

    var btn = document.getElementById("exportCsv");
    if (btn) btn.addEventListener("click", exportCsv);
    loadTraffic();
  }

  function fmtDur(secs) {
    if (!secs) return "—";
    var m = Math.floor(secs / 60), s = secs % 60;
    return m ? m + "m " + s + "s" : s + "s";
  }
  function barList(title, items, unit) {
    if (!items.length) return '<h3 style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">' + title + '</h3><p class="row-sub">No data yet.</p>';
    var max = Math.max.apply(null, items.map(function (x) { return x.n; }).concat([1]));
    return '<h3 style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">' + title + '</h3>' +
      '<div class="bars">' + items.map(function (x) {
        return '<div class="bar-row"><span class="lab" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.lab) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(3, Math.round(x.n / max * 100)) + '%"></span></span><span class="val">' + x.n + '</span></div>';
      }).join("") + '</div>';
  }

  /* Site traffic: first-party counts from /api/traffic (views + unique visitors). */
  function loadTraffic() {
    var panel = document.getElementById("trafficPanel");
    var summary = document.getElementById("trafficSummary");
    if (!panel) return;
    fetch("/api/traffic", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { panel.innerHTML = '<p class="row-sub">Traffic data unavailable.</p>'; return; }
        var days = d.days || [];
        var last14 = days.slice(-14), last7 = days.slice(-7), last30 = days;
        var today = days[days.length - 1] || { views: 0, uniques: 0 };
        var sum = function (list, k) { return list.reduce(function (s, x) { return s + (x[k] || 0); }, 0); };
        var firstTracked = null;
        for (var i = 0; i < days.length; i++) { if (days[i].views > 0) { firstTracked = days[i].date; break; } }
        summary.textContent = sum(last7, "uniques") + " visitors · " + sum(last7, "views") + " views this week" +
          (firstTracked ? " · counting since " + new Date(firstTracked + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : " · counting starts with the next visit");
        var max = Math.max.apply(null, last14.map(function (x) { return x.views; }).concat([1]));
        var bars = last14.map(function (x) {
          var h = Math.max(2, Math.round(x.views / max * 100));
          var label = new Date(x.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return '<div class="repbar" title="' + label + ': ' + x.views + ' views · ' + x.uniques + ' visitors">' +
            '<b>' + (x.views || "—") + '</b>' +
            '<span class="rb-fill' + (x.views ? "" : " is-zero") + '" style="height:' + h + '%"></span>' +
            '<small>' + label.replace(" ", "&nbsp;") + '</small></div>';
        }).join("");
        var pages = (d.topPages || []).slice(0, 6);
        var pageMax = Math.max.apply(null, pages.map(function (p) { return p.views; }).concat([1]));
        panel.innerHTML =
          '<div class="kpis" style="margin-bottom:18px">' +
            '<div class="kpi"><span class="kpi-label">Today</span><span class="kpi-num">' + today.uniques.toLocaleString() + '</span><span class="kpi-sub">' + today.views.toLocaleString() + ' page view' + (today.views === 1 ? "" : "s") + '</span></div>' +
            '<div class="kpi"><span class="kpi-label">Visitors (7 days)</span><span class="kpi-num">' + sum(last7, "uniques").toLocaleString() + '</span><span class="kpi-sub">' + sum(last7, "views").toLocaleString() + ' views</span></div>' +
            '<div class="kpi"><span class="kpi-label">Visitors (30 days)</span><span class="kpi-num">' + sum(last30, "uniques").toLocaleString() + '</span><span class="kpi-sub">' + sum(last30, "views").toLocaleString() + ' views</span></div>' +
            '<div class="kpi"><span class="kpi-label">Avg. time on site (7 days)</span><span class="kpi-num">' + fmtDur(d.avgVisitSeconds || 0) + '</span><span class="kpi-sub">per visitor per day</span></div>' +
          '</div>' +
          '<div class="repchart">' + bars + '</div>' +
          '<div class="cols-2-even" style="margin-top:20px;gap:24px"><div>' +
            barList("Top pages", pages.map(function (p) { return { lab: p.path, n: p.views }; }), "views") +
          '</div><div>' +
            barList("Where visitors come from", (d.sources || []).map(function (s) { return { lab: s.source === "direct" ? "Direct / typed in" : s.source, n: s.visits }; }), "visits") +
            '<div style="margin-top:20px">' +
            (d.cityLookupConfigured
              ? barList("Visitor cities", (d.cities || []).map(function (c) { return { lab: c.city, n: c.visits }; }), "visits")
              : '<h3 style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Visitor cities</h3><p class="row-sub">Add a free ipinfo.io token as IPINFO_TOKEN in the server settings to see which cities your visitors are in.</p>') +
            '</div>' +
          '</div></div>';
      })
      .catch(function () { panel.innerHTML = '<p class="row-sub">Traffic data unavailable.</p>'; });
  }

  function exportCsv() {
    var orders = L.orders();
    var head = ["Order ID", "Date", "Status", "Customer", "Company", "Email", "Method", "Cartons", "Material", "Freight", "Tax", "Total"];
    var rows = [head.join(",")];
    var cell = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    orders.forEach(function (o) {
      var cartons = Object.keys(o.items).reduce(function (t, id) {
        var p = productById(id), e = o.items[id];
        return t + (p && e.sqft > 0 ? cartonsFor(p, e.sqft) : 0);
      }, 0);
      var c = o.customer || {}, tt = o.totals || {}, d = o.delivery || {};
      rows.push([
        cell(o.id), cell(new Date(o.createdAt).toISOString().slice(0, 10)), cell(o.status),
        cell(c.name), cell(c.company), cell(c.email), cell(d.method),
        cartons, tt.material || 0, tt.freight || 0, tt.tax || 0, tt.total || 0
      ].join(","));
    });
    var blob = new Blob([rows.join("\n")], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "lunde-orders-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    if (L.showToast) L.showToast("Orders exported to CSV");
  }

  render();
  document.addEventListener("lunde:synced", render);
})();
