/* Lunde V6 — shared chrome (header + footer + mobile menu). Load BEFORE store.js. */
(function () {
  var hasInlineChrome = !!document.getElementById("v6Header");

  var topbar =
    '<div class="v6-topbar"><span class="tb-full">Free samples, delivered to your door &nbsp;·&nbsp; Free local delivery on orders over $1,200 across Bakersfield &amp; Kern County &nbsp;·&nbsp; <a href="./samples.html">Order swatches</a></span><span class="tb-short">Free local delivery $1,200+ &nbsp;·&nbsp; <a href="./samples.html">Free samples</a></span></div>';

  var mobileMenu =
    '<div class="v6-mobile-menu" id="v6MobileMenu" hidden>' +
      '<div class="v6-mobile-primary">' +
        '<a href="./catalog.html">Floors</a>' +
        '<a href="./samples.html">Free samples</a>' +
        '<a href="./cart.html">Cart</a>' +
        '<a href="/account">My account</a>' +
      '</div>' +
      '<div class="v6-mobile-secondary">' +
        '<a href="./install.html">Installation</a>' +
        '<a href="./care-maintenance.html">Care &amp; Maintenance</a>' +
        '<a href="./faq.html">FAQ</a>' +
        '<a href="./warranty.html">Warranty</a>' +
        '<a href="./areas-we-serve.html">Areas We Serve</a>' +
        '<a href="./contact.html">Contact</a>' +
      '</div>' +
    '</div>';

  var tabbar =
    '<nav class="v6-tabbar" id="v6Tabbar" aria-label="Mobile app navigation">' +
      '<a href="./index.html" data-tab="home"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M9 21v-6h6v6"></path></svg><span>Home</span></a>' +
      '<a href="./catalog.html" data-tab="floors"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16M4 12h16M4 19h16"></path><path d="M8 5v14M16 5v14"></path></svg><span>Floors</span></a>' +
      '<a href="./samples.html" data-tab="samples"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="7" height="7"></rect><rect x="13" y="4" width="7" height="7"></rect><rect x="4" y="13" width="7" height="7"></rect><rect x="13" y="13" width="7" height="7"></rect></svg><span>Samples</span></a>' +
      '<a href="./cart.html" data-tab="cart"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 7h12l-1 13H7L6 7Z"></path><path d="M9 7a3 3 0 0 1 6 0"></path></svg><b data-cart-count>0</b><span>Cart</span></a>' +
      '<a href="/account" data-tab="account"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path></svg><span>Account</span></a>' +
    '</nav>';

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
    mobileMenu;

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

  if (!hasInlineChrome) {
    document.body.insertAdjacentHTML("afterbegin", topbar + header);
    // footer goes after <main> / page content
    document.body.insertAdjacentHTML("beforeend", footer);
  } else if (!document.getElementById("v6MobileMenu")) {
    document.getElementById("v6Header").insertAdjacentHTML("afterend", mobileMenu);
  }
  if (!document.getElementById("v6Tabbar")) document.body.insertAdjacentHTML("beforeend", tabbar);

  // active nav
  var active = document.body.getAttribute("data-nav");
  var path = location.pathname.split("/").pop() || "index.html";
  if (!active) {
    if (path === "catalog.html" || path === "product.html") active = "floors";
    else if (path === "samples.html") active = "samples";
    else if (path === "index.html") active = "home";
    else if (path.indexOf("account") === 0) active = "account";
    else if (path === "cart.html" || path === "checkout.html") active = "cart";
  }
  if (active) {
    var link = document.querySelector('.v6-nav [data-nav="' + active + '"]');
    if (link) link.style.color = "var(--ink)";
    var dd = document.querySelector('.v6-nav-dd[data-nav="' + active + '"]');
    if (dd) dd.setAttribute("aria-current", "page");
    var tab = document.querySelector('.v6-tabbar [data-tab="' + active + '"]');
    if (tab) tab.setAttribute("aria-current", "page");
  }

  // smart sticky header
  var h = document.getElementById("v6Header");
  var lastY = window.scrollY || 0;
  var onScroll = function () {
    var y = window.scrollY || 0;
    var dy = y - lastY;
    lastY = y;
    h.classList.toggle("is-shrunk", y > 12);
    if (window.matchMedia("(max-width: 860px)").matches && y > 140 && dy > 8) h.classList.add("is-hidden");
    else if (dy < -4 || y < 60) h.classList.remove("is-hidden");
  };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // mobile menu
  var burger = document.getElementById("v6Burger") || document.querySelector(".v6-burger");
  var menu = document.getElementById("v6MobileMenu");
  var burgerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18M3 12h18M3 17h18"></path></svg>';
  var closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
  function navPulse() {
    if (!window.matchMedia("(max-width: 860px)").matches) return;
    if (navigator.vibrate) navigator.vibrate(10);
  }
  function setMenu(open) {
    menu.hidden = !open;
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Menu");
    burger.innerHTML = open ? closeIcon : burgerIcon;
    document.body.classList.toggle("is-menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    h.classList.remove("is-hidden");
  }
  if (burger && menu) {
    burger.addEventListener("click", function () {
      navPulse();
      setMenu(menu.hidden);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        navPulse();
        setMenu(false);
      }
    });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".v6-tabbar a")) return;
    navPulse();
  });

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
    if (menu && !menu.hidden) setMenu(false);
    var openDd = document.querySelector(".v6-nav-dd.is-open");
    closeNavDropdowns(null);
    if (openDd) { var b = openDd.querySelector("button"); if (b) b.focus(); }
  });
})();
