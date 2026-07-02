/* Lunde V6 — shared chrome (header + footer + mobile menu). Load BEFORE store.js. */
(function () {
  if (document.getElementById("v6Header")) return; // page already has inline chrome

  var topbar =
    '<div class="v6-topbar"><span class="tb-full">Free samples, delivered to your door &nbsp;·&nbsp; Free local delivery on orders over $1,200 across Bakersfield &amp; Kern County &nbsp;·&nbsp; <a href="./samples.html">Order swatches</a></span><span class="tb-short">Free local delivery $1,200+ &nbsp;·&nbsp; <a href="./samples.html">Free samples</a></span></div>';

  var header =
    '<header class="v6-header" id="v6Header"><div class="v6-header-inner">' +
      '<nav class="v6-nav" aria-label="Primary">' +
        '<a href="./catalog.html" data-nav="floors">Floors</a>' +
        '<a href="./samples.html" data-nav="samples">Samples</a>' +
        '<div class="v6-nav-dd" data-nav="resources">' +
          '<button type="button" aria-haspopup="true" aria-expanded="false">Resources</button>' +
          '<div class="v6-nav-dd-menu">' +
            '<a href="./install.html">Installation</a>' +
            '<a href="./care-maintenance.html">Care &amp; Maintenance</a>' +
            '<a href="./faq.html">FAQ</a>' +
            '<a href="./warranty.html">Warranty</a>' +
            '<a href="./areas-we-serve.html">Areas We Serve</a>' +
          '</div>' +
        '</div>' +
      '</nav>' +
      '<a class="v6-brand" href="./index.html">Lunde<small>Flooring Co.</small></a>' +
      '<div class="v6-actions">' +
        '<a class="v6-icon" href="./catalog.html" aria-label="Search floors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg></a>' +
        '<a class="v6-icon" href="/account" aria-label="My account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 4-6.2 8-6.2S20 16 20 20"></path></svg></a>' +
        '<a class="v6-icon v6-cart" href="./cart.html" aria-label="Cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 7h12l-1 13H7L6 7Z"></path><path d="M9 7a3 3 0 0 1 6 0"></path></svg><b data-cart-count>0</b></a>' +
        '<button class="v6-icon v6-burger" type="button" id="v6Burger" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18M3 12h18M3 17h18"></path></svg></button>' +
      '</div>' +
    '</div></header>' +
    '<div class="v6-mobile-menu" id="v6MobileMenu" hidden>' +
      '<a href="./catalog.html">Floors</a>' +
      '<a href="./samples.html">Samples</a>' +
      '<a href="./install.html">Installation</a>' +
      '<a href="./care-maintenance.html">Care &amp; Maintenance</a>' +
      '<a href="./faq.html">FAQ</a>' +
      '<a href="./warranty.html">Warranty</a>' +
      '<a href="./areas-we-serve.html">Areas We Serve</a>' +
      '<a href="/account">My account</a>' +
      '<a href="./cart.html">Cart</a>' +
    '</div>';

  var footer =
    '<footer class="v6-footer"><div class="wrap v6-footer-grid">' +
      '<div class="v6-footer-brand"><span class="v6-brand">Lunde<small>Flooring Co.</small></span>' +
        '<p>Luxury Vinyl Plank Flooring for Bakersfield &amp; Kern County.</p></div>' +
      '<div class="v6-fcol"><h4>Shop</h4><a href="./catalog.html">All floors</a><a href="./samples.html">Samples</a><a href="./areas-we-serve.html">Areas we serve</a></div>' +
      '<div class="v6-fcol"><h4>Help</h4><a href="./shipping-returns.html">Shipping &amp; returns</a><a href="./install.html">Installation</a><a href="./care-maintenance.html">Care &amp; maintenance</a><a href="./faq.html">FAQ</a><a href="./warranty.html">Warranty</a><a href="./contact.html">Contact us</a></div>' +
      '<div class="v6-fcol"><h4>Company</h4><a href="./our-story.html">Our story</a><a href="./contact.html">Contact</a><a href="https://www.instagram.com/lundeflooring/" target="_blank" rel="noopener">Instagram</a></div>' +
    '</div>' +
    '<div class="wrap" style="padding-top:8px"><p style="font-size:12px;letter-spacing:.02em;color:var(--muted);max-width:none">Lunde Flooring Co. proudly serves Bakersfield, Oildale, Rosedale, Seven Oaks, Shafter, Wasco, Delano, McFarland, Lamont, Arvin, Taft, Tehachapi, Frazier Park, Lake Isabella, Ridgecrest, and all of Kern County, California.</p></div>' +
    '<div class="v6-footer-base"><span>© 2026 Lunde Flooring Co. All rights reserved.</span><span><a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a> · <a href="./accessibility.html">Accessibility</a></span></div></footer>';

  document.body.insertAdjacentHTML("afterbegin", topbar + header);
  // footer goes after <main> / page content
  document.body.insertAdjacentHTML("beforeend", footer);

  // active nav
  var active = document.body.getAttribute("data-nav");
  if (active) {
    var link = document.querySelector('.v6-nav [data-nav="' + active + '"]');
    if (link) link.style.color = "var(--ink)";
    var dd = document.querySelector('.v6-nav-dd[data-nav="' + active + '"]');
    if (dd) dd.setAttribute("aria-current", "page");
  }

  // scroll shadow
  var h = document.getElementById("v6Header");
  var onScroll = function () {
    h.style.boxShadow = window.scrollY > 12 ? "0 1px 0 rgba(32,30,26,0.06), 0 10px 30px -22px rgba(32,30,26,0.5)" : "none";
  };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // mobile menu
  var burger = document.getElementById("v6Burger");
  var menu = document.getElementById("v6MobileMenu");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      menu.hidden = !menu.hidden;
      document.body.style.overflow = menu.hidden ? "" : "hidden";
    });
    menu.addEventListener("click", function (e) { if (e.target.tagName === "A") { menu.hidden = true; document.body.style.overflow = ""; } });
  }

  function closeNavDropdowns(except) {
    document.querySelectorAll(".v6-nav-dd.is-open").forEach(function (dd) {
      if (dd === except) return;
      dd.classList.remove("is-open");
      var b = dd.querySelector("button");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest(".v6-nav-dd > button");
    var dd = button ? button.closest(".v6-nav-dd") : null;
    closeNavDropdowns(dd);
    if (!button) return;
    event.stopPropagation();
    var open = dd.classList.toggle("is-open");
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var openDd = document.querySelector(".v6-nav-dd.is-open");
    closeNavDropdowns(null);
    if (openDd) { var b = openDd.querySelector("button"); if (b) b.focus(); }
  });
})();
