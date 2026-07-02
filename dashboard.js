/* Lunde V6 — staff dashboard (morning briefing) */
(function () {
  var L = window.lunde;
  var money = L.money, STATUS_LABELS = L.STATUS_LABELS;
  var mount = document.getElementById("dash");
  var DAY = 86400000;

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
  function days(ms) { return Math.floor(ms / DAY); }
  function ic(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + p + '</svg>'; }
  function kpi(href, tone, icon, num, label, sub) {
    return '<a class="kpi" href="' + href + '"><span class="kpi-ic" data-tone="' + tone + '">' + ic(icon) + '</span><span class="kpi-num">' + num + '</span><span class="kpi-label">' + label + '</span><span class="kpi-sub">' + sub + '</span></a>';
  }
  function snippet(text, n) {
    var t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    return esc(t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);
  }

  /* ---------- needs attention ---------- */

  function lastMovementAt(o) {
    var h = o.history;
    if (h && h.length) return h[h.length - 1].at || o.createdAt;
    return o.createdAt;
  }

  function attentionRow(href, kind, tag, title, sub) {
    return '<a class="row" href="' + href + '" style="grid-template-columns:1fr auto">' +
      '<span><span class="row-title">' + title + '</span><span class="row-sub">' + sub + '</span></span>' +
      '<span class="att-tag" data-kind="' + kind + '">' + tag + '</span></a>';
  }

  function buildAttention(orders, quotes, products, now) {
    var rows = [];

    // Unpaid invoices past due (30+ days old, never paid)
    orders.filter(function (o) {
      return o.status !== "cancelled" && o.payment && o.payment.method === "invoice" && !o.payment.paidAt && (now - o.createdAt) > 30 * DAY;
    }).sort(function (a, b) { return a.createdAt - b.createdAt; }).forEach(function (o) {
      rows.push(attentionRow("./order.html?id=" + encodeURIComponent(o.id), "pastdue", "Past due",
        esc(o.id) + " — " + esc(o.customer && o.customer.name || "Guest"),
        "Invoice unpaid · " + money(o.totals && o.totals.total || 0) + " · placed " + days(now - o.createdAt) + "d ago" + (o.payment.terms ? " (" + esc(o.payment.terms) + ")" : "")));
    });

    // Stuck orders: placed/processing with no status movement for 3+ days
    orders.filter(function (o) {
      return (o.status === "placed" || o.status === "processing") && (now - lastMovementAt(o)) >= 3 * DAY;
    }).sort(function (a, b) { return lastMovementAt(a) - lastMovementAt(b); }).forEach(function (o) {
      rows.push(attentionRow("./order.html?id=" + encodeURIComponent(o.id), "stuck", "Stuck " + days(now - lastMovementAt(o)) + "d",
        esc(o.id) + " — " + esc(o.customer && o.customer.name || "Guest"),
        (STATUS_LABELS[o.status] || esc(o.status)) + " for " + days(now - lastMovementAt(o)) + " days · " + money(o.totals && o.totals.total || 0)));
    });

    // Aging quotes: saved/sent, untouched for 21+ days, not won
    quotes.filter(function (q) {
      return (q.status === "saved" || q.status === "sent") && (now - (q.updatedAt || q.createdAt)) > 21 * DAY;
    }).sort(function (a, b) { return (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt); }).forEach(function (q) {
      var expired = q.expiresAt && q.expiresAt < now;
      rows.push(attentionRow("./quotes.html", "quote", expired ? "Expired" : "Aging quote",
        esc(q.job || q.id) + (q.customer && q.customer.name ? " — " + esc(q.customer.name) : ""),
        (expired ? "Expired · " : "") + "No activity for " + days(now - (q.updatedAt || q.createdAt)) + " days"));
    });

    // Low / out of stock floors
    var lowStock = products.filter(function (p) { var i = L.stockInfo(p.id); return i.level === "low" || i.level === "out"; });
    lowStock.slice(0, 5).forEach(function (p) {
      var i = L.stockInfo(p.id);
      rows.push(attentionRow("./inventory.html", "stock", i.level === "out" ? "Out of stock" : "Low stock",
        esc(p.title),
        esc((p.collection || "").replace("AdoFloor ", "")) + " · " + (i.level === "out" ? "0 cartons — backordered" : i.cartons + " cartons left")));
    });
    if (lowStock.length > 5) {
      rows.push(attentionRow("./inventory.html", "stock", "+" + (lowStock.length - 5) + " more",
        "More stock alerts", (lowStock.length - 5) + " more floors are low or out — open inventory"));
    }

    return rows;
  }

  /* ---------- render ---------- */

  function render() {
    var orders = L.orders(), products = L.products();
    var quotes = L.quotes ? L.quotes() : [];
    var feedback = L.feedbackItems ? L.feedbackItems() : [];
    var session = window.lundeSession || {};
    var now = Date.now();

    var notCancelled = orders.filter(function (o) { return o.status !== "cancelled"; });
    var lifetimeRev = notCancelled.reduce(function (s, o) { return s + (o.totals && o.totals.total || 0); }, 0);
    var openOrders = orders.filter(function (o) { return o.status !== "delivered" && o.status !== "cancelled"; });
    var openMsgs = feedback.filter(function (f) { return ["resolved", "archived", "replied"].indexOf(f.status || "") === -1 && !(Array.isArray(f.replies) && f.replies.length); });

    // Today
    var dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart = dayStart.getTime();
    var todayOrders = notCancelled.filter(function (o) { return o.createdAt >= dayStart; });
    var todayRev = todayOrders.reduce(function (s, o) { return s + (o.totals && o.totals.total || 0); }, 0);

    // This week (rolling 7 days) vs the 7 days before
    function revBetween(a, b) { return notCancelled.filter(function (o) { return o.createdAt >= a && o.createdAt < b; }).reduce(function (s, o) { return s + (o.totals && o.totals.total || 0); }, 0); }
    var weekRev = revBetween(now - 7 * DAY, now + 1);
    var prevWeekRev = revBetween(now - 14 * DAY, now - 7 * DAY);
    var deltaHtml;
    if (prevWeekRev > 0) {
      var pct = Math.round(((weekRev - prevWeekRev) / prevWeekRev) * 100);
      deltaHtml = '<span class="kpi-delta" data-dir="' + (pct >= 0 ? "up" : "down") + '">' + (pct >= 0 ? "▲ +" : "▼ −") + Math.abs(pct) + "%</span> vs last week";
    } else if (weekRev > 0) {
      deltaHtml = '<span class="kpi-delta" data-dir="up">▲ New</span> — no revenue last week';
    } else {
      deltaHtml = "No orders in the last two weeks";
    }

    var attention = buildAttention(orders, quotes, products, now);
    var firstName = esc((session.name || "there").split(" ")[0]);
    var recent = orders.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 7);
    var inboxPreview = openMsgs.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 3);

    function thumbBg(o) {
      var ids = Object.keys(o.items || {});
      var p = ids.map(function (id) { return L.productById(id); }).filter(Boolean)[0];
      return p ? L.thumb(p.mainImage) : "";
    }
    function orderItemsLabel(o) {
      var n = Object.keys(o.items || {}).length;
      return n + " item" + (n === 1 ? "" : "s");
    }

    mount.innerHTML =
      '<div class="app-head"><div><p class="eyebrow">Morning briefing</p><h1>Good to see you, ' + firstName + '.</h1>' +
        '<p>Here’s what needs a hand first · Lifetime revenue ' + money(lifetimeRev) + '</p></div>' +
        '<div class="dash-actions"><a class="btn" href="./quotes.html">New quote</a><a class="btn ghost" href="./orders.html">Orders</a></div></div>' +

      '<div class="panel" style="margin-bottom:18px"><div class="panel-head"><h2>Needs attention' + (attention.length ? '<span class="att-count">' + attention.length + '</span>' : '') + '</h2><a href="./orders.html">Orders</a></div>' +
        (attention.length ? '<div class="rowlist">' + attention.join("") + '</div>'
          : '<div class="dash-allclear"><b>All clear</b>No stuck orders, overdue invoices, aging quotes, or stock alerts.</div>') + '</div>' +

      '<div class="kpis">' +
        kpi("./orders.html", "green", '<path d="M4 20V4M4 20h16"/><path d="M7 14l4-4 3 3 5-6"/>', money(todayRev), "Today", todayOrders.length + " order" + (todayOrders.length === 1 ? "" : "s") + " so far") +
        kpi("./reports.html", weekRev >= prevWeekRev ? "green" : "amber", '<path d="M3 12h4l3-7 4 14 3-7h4"/>', money(weekRev), "This week", deltaHtml) +
        kpi("./orders.html", "amber", '<path d="M6 4h12l1 16H5L6 4Z"/><path d="M9 8h6"/>', openOrders.length, "Open orders", "Awaiting fulfillment") +
        kpi("./messages.html", openMsgs.length ? "violet" : "blue", '<path d="M4 5h16v11H9l-5 4V5Z"/>', openMsgs.length, "Open messages", openMsgs.length ? "Awaiting a reply" : "All caught up") +
      '</div>' +

      '<div class="cols-2">' +
        '<div class="panel"><div class="panel-head"><h2>Recent orders</h2><a href="./orders.html">View all</a></div>' +
          '<div class="rowlist">' + (recent.length ? recent.map(function (o) {
            return '<a class="row" href="./order.html?id=' + encodeURIComponent(o.id) + '" style="grid-template-columns:44px 1fr auto auto">' +
              '<span class="row-thumb" style="background-image:url(\'' + thumbBg(o) + '\')"></span>' +
              '<span><span class="row-title">' + esc(o.id) + '</span><span class="row-sub">' + esc(o.customer && o.customer.name || "Guest") + ' · ' + orderItemsLabel(o) + ' · ' + ago(o.createdAt) + '</span></span>' +
              '<span class="status-badge" data-status="' + esc(o.status) + '"><i></i>' + (STATUS_LABELS[o.status] || esc(o.status)) + '</span>' +
              '<span class="row-strong">' + money(o.totals && o.totals.total || 0) + '</span></a>';
          }).join("") : '<div class="app-empty"><p>No orders yet.</p></div>') + '</div></div>' +
        '<div class="panel"><div class="panel-head"><h2>Inbox</h2><a href="./messages.html">Open inbox</a></div>' +
          '<div class="rowlist">' + (inboxPreview.length ? inboxPreview.map(function (f) {
            return '<a class="row" href="./messages.html" style="grid-template-columns:1fr auto">' +
              '<span><span class="row-title">' + esc(f.name || "Anonymous") + '</span><span class="row-sub">' + snippet(f.message, 80) + '</span></span>' +
              '<span class="row-sub" style="white-space:nowrap">' + ago(f.createdAt || now) + '</span></a>';
          }).join("") + (openMsgs.length > 3 ? '<a class="row" href="./messages.html" style="grid-template-columns:1fr"><span class="row-sub">+' + (openMsgs.length - 3) + ' more open message' + (openMsgs.length - 3 === 1 ? "" : "s") + '</span></a>' : '')
          : '<div class="app-empty"><p>No open messages — you’re all caught up.</p></div>') + '</div></div>' +
      '</div>';
  }

  render();

  document.addEventListener("lunde:synced", function () {
    // Skip re-render if the user is typing somewhere inside the dashboard.
    var el = document.activeElement;
    if (el && mount.contains(el) && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
})();
