// An old app link such as "/#v=2&lat=..." carries its state in the hash, which
// the server never sees. The app now lives at /map, so forward it there.
(function () {
  if (location.pathname === '/' && location.hash.length > 1) {
    location.replace('/map' + location.search + location.hash);
  }
})();

// Decorative: builds the hero's "traffic blocks".
(function () {
  var bars = document.getElementById('bars');
  if (!bars) return;
  var rows = 22;
  for (var r = 0; r < rows; r++) {
    var row = document.createElement('div');
    row.className = 'row';
    var total = 0;
    while (total < 100) {
      var w = 4 + Math.random() * 22;
      var seg = document.createElement('div');
      seg.className = 'seg';
      seg.style.setProperty('--w', w.toFixed(1));
      var n = Math.random();
      if (n > 0.93) seg.classList.add('hotter');
      else if (n > 0.8) seg.classList.add('hot');
      row.appendChild(seg);
      total += w;
    }
    bars.appendChild(row);
  }
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var segs = bars.querySelectorAll('.seg');
  setInterval(function () {
    var s = segs[Math.floor(Math.random() * segs.length)];
    s.classList.toggle('hot');
  }, 140);
})();

// Scroll reveal. Content stays visible if IntersectionObserver is missing.
(function () {
  var items = document.querySelectorAll('.reveal');
  if (!items.length || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  items.forEach(function (el) {
    io.observe(el);
  });
})();
