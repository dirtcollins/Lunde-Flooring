/* Lunde V6 — samples */
(function () {
  var L = window.lunde;
  var products = function () { return window.LUNDE_PUBLIC_PRODUCTS || L.products().filter(function (p) { return !p.archived; }); };
  var money = L.money, cart = L.cart, updateEntry = L.updateEntry;
  var grid = document.getElementById("sampleGrid");
  var bar = document.getElementById("sampleBar");
  var barN = document.getElementById("sampleBarN");

  function sampleCount() {
    var c = cart(), n = 0;
    Object.keys(c).forEach(function (id) { n += c[id].samples || 0; });
    return n;
  }
  function inBox(id) { return ((cart()[id] || {}).samples || 0) > 0; }

  function card(p) {
    var on = inBox(p.id);
    return '<article class="v6-card" data-id="' + p.id + '">' +
      '<a class="v6-card-media" href="./product.html?slug=' + p.slug + '">' +
        '<span class="swatch" style="position:absolute;inset:0;background-image:url(\'' + L.img(p.mainImage) + '\')"></span>' +
        '<button class="v6-card-sample" type="button" data-sample="' + p.id + '" style="opacity:1;transform:none;' + (on ? 'background:var(--ink);color:var(--on-dark)' : '') + '">' + (on ? '✓ In your box' : 'Add to sample box') + '</button>' +
      '</a>' +
      '<a class="v6-card-body" href="./product.html?slug=' + p.slug + '">' +
        '<span class="v6-card-coll">' + p.collection.replace("AdoFloor ", "") + '</span>' +
        '<span class="v6-card-name">' + p.title + '</span>' +
        '<span class="v6-card-price"><b>' + money(p.samplePrice) + '</b><span> sample · ships free</span></span>' +
      '</a></article>';
  }

  function render() {
    grid.innerHTML = products().map(card).join("");
    update();
  }
  function update() {
    var n = sampleCount();
    barN.textContent = n;
    bar.classList.toggle("show", n > 0);
    document.body.classList.toggle("has-samplebar", n > 0);
    document.getElementById("sampleCount").textContent = products().length + " floors · choose as many as you like";
  }

  grid.addEventListener("click", function (e) {
    var b = e.target.closest("[data-sample]"); if (!b) return;
    e.preventDefault();
    var id = b.dataset.sample;
    var entry = cart()[id] || { sqft: 0, samples: 0 };
    if ((entry.samples || 0) > 0) updateEntry(id, { samples: 0 });
    else updateEntry(id, { samples: 1 });
    var on = inBox(id);
    b.textContent = on ? "✓ In your box" : "Add to sample box";
    b.style.background = on ? "var(--ink)" : "";
    b.style.color = on ? "var(--on-dark)" : "";
    update();
  });

  render();
})();
