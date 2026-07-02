/* Lunde V6 — cart */
(function () {
  var L = window.lunde;
  var cart = L.cart, productById = L.productById, money = L.money, cartTotals = L.cartTotals;
  var cartonsFor = L.cartonsFor, sqftPerCarton = L.sqftPerCarton, cartonPrice = L.cartonPrice, materialEstimate = L.materialEstimate;
  var updateEntry = L.updateEntry, thumb = L.thumb;
  var page = document.getElementById("cartPage");

  function lineMaterial(p, entry) {
    var cartons = cartonsFor(p, entry.sqft);
    var covered = (cartons * sqftPerCarton(p)).toFixed(0);
    return '<div class="v6-line" data-line="material" data-id="' + p.id + '">' +
      '<a class="v6-line-img" href="./product.html?slug=' + p.slug + '" style="background-image:url(\'' + thumb(p.mainImage) + '\')"></a>' +
      '<div class="v6-line-info"><strong>' + p.title + '</strong>' +
        '<span>' + p.collection + ' · ' + money(cartonPrice(p)) + '/carton · covers ' + covered + ' sq. ft.</span>' +
        '<span style="color:var(--sage)">Material · sold by full carton</span></div>' +
      '<div class="v6-line-right">' +
        '<div class="v6-stepper"><button type="button" data-step="-1" aria-label="One fewer carton">−</button><b>' + cartons + ' ctn</b><button type="button" data-step="1" aria-label="One more carton">+</button></div>' +
        '<span class="v6-line-price">' + money(materialEstimate(p, entry.sqft)) + '</span>' +
        '<button class="v6-line-remove" type="button" data-remove="material">Remove</button>' +
      '</div></div>';
  }
  function lineSample(p, entry) {
    return '<div class="v6-line" data-line="sample" data-id="' + p.id + '">' +
      '<a class="v6-line-img" href="./product.html?slug=' + p.slug + '" style="background-image:url(\'' + thumb(p.mainImage) + '\')"></a>' +
      '<div class="v6-line-info"><strong>' + p.title + ' — sample</strong>' +
        '<span>' + money(p.samplePrice) + ' each · ships free</span></div>' +
      '<div class="v6-line-right">' +
        '<div class="v6-stepper"><button type="button" data-step="-1" aria-label="One fewer sample">−</button><b>' + entry.samples + '</b><button type="button" data-step="1" aria-label="One more sample">+</button></div>' +
        '<span class="v6-line-price">' + money(entry.samples * p.samplePrice) + '</span>' +
        '<button class="v6-line-remove" type="button" data-remove="sample">Remove</button>' +
      '</div></div>';
  }

  function render() {
    var items = cart();
    var ids = Object.keys(items);
    if (!ids.length) {
      page.innerHTML = '<div class="v6-empty"><p class="eyebrow">Your cart</p><h1 class="display">Your cart is empty.</h1>' +
        '<p>Add cartons or samples from any floor, then come back to review your order.</p>' +
        '<a class="btn lg" href="./catalog.html">Browse the floors</a></div>';
      return;
    }
    var lines = "";
    ids.forEach(function (id) {
      var p = productById(id); if (!p) return;
      var e = items[id];
      if (e.sqft > 0) lines += lineMaterial(p, e);
      if ((e.samples || 0) > 0) lines += lineSample(p, e);
    });
    var t = cartTotals(items);
    page.innerHTML =
      '<div class="v6-page-head"><p class="eyebrow">Your cart</p><h1 class="display">Review your order.</h1></div>' +
      '<div class="cart-layout">' +
        '<div class="cart-lines">' + lines + '</div>' +
        '<aside class="v6-sum"><h3>Summary</h3>' +
          '<div class="v6-sumrow"><span>Material</span><b>' + money(t.material) + '</b></div>' +
          '<div class="v6-sumrow"><span>Samples</span><b>' + money(t.samples) + '</b></div>' +
          '<div class="v6-sum-divide"></div>' +
          '<div class="v6-sumrow"><span>Subtotal</span><b>' + money(t.subtotal) + '</b></div>' +
          '<div class="v6-sumrow"><span>Freight &amp; tax</span><b>Calculated at checkout</b></div>' +
          '<div class="v6-sumtotal"><span>Estimated subtotal</span><b>' + money(t.subtotal) + '</b></div>' +
          '<a class="btn lg" href="./checkout.html">Proceed to checkout</a>' +
          '<p class="v6-sum-note">Material is sold by full carton. Free shipping on orders over $1,200.</p>' +
        '</aside>' +
      '</div>' +
      '<div style="padding-bottom:clamp(48px,6vw,90px)"><a class="link-underline" href="./catalog.html">Continue shopping<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg></a></div>';
  }

  page.addEventListener("click", function (e) {
    var lineEl = e.target.closest(".v6-line"); if (!lineEl) return;
    var id = lineEl.dataset.id, kind = lineEl.dataset.line;
    var entry = cart()[id] || { sqft: 0, samples: 0 };
    var p = productById(id);
    var step = e.target.closest("[data-step]");
    if (step) {
      var dir = Number(step.dataset.step);
      if (kind === "material") {
        var cartons = Math.max(0, cartonsFor(p, entry.sqft) + dir);
        updateEntry(id, { sqft: cartons * sqftPerCarton(p) });
      } else {
        updateEntry(id, { samples: Math.max(0, (entry.samples || 0) + dir) });
      }
      render(); return;
    }
    if (e.target.closest("[data-remove]")) {
      if (kind === "material") updateEntry(id, { sqft: 0 });
      else updateEntry(id, { samples: 0 });
      render(); return;
    }
  });

  render();
})();
