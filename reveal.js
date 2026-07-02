/* Lunde — scroll reveal.
   Fail-open: if IntersectionObserver's callback never fires (throttled or
   non-painting contexts), reveal everything so content is never left stuck
   at opacity:0. In normal browsers IO fires first, preserving the fade. */
(function () {
  function run() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    function showAll() { els.forEach(function (e) { e.style.transition = "none"; e.style.opacity = "1"; e.style.transform = "none"; e.classList.add("in"); }); }
    if (!("IntersectionObserver" in window)) { showAll(); return; }
    var ioWorks = false;
    var io = new IntersectionObserver(function (entries) {
      ioWorks = true;
      entries.forEach(function (x) {
        if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
    // If the observer never reports (initial callback should fire almost
    // immediately in a working environment), it isn't functioning here — reveal all.
    setTimeout(function () { if (!ioWorks) showAll(); }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
