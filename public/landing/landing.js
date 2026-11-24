// Decorative only: builds the hero's "traffic blocks" and the barcode strip.
(function () {
  var bars = document.getElementById('bars');
  if (bars) {
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
    if (!reduce) {
      var segs = bars.querySelectorAll('.seg');
      setInterval(function () {
        var s = segs[Math.floor(Math.random() * segs.length)];
        s.classList.toggle('hot');
      }, 140);
    }
  }
  var code = document.getElementById('barcode');
  if (code) {
    for (var i = 0; i < 46; i++) {
      var b = document.createElement('i');
      b.style.flex = String(1 + Math.floor(Math.random() * 3));
      b.style.opacity = i % 7 === 0 ? '0.25' : '1';
      code.appendChild(b);
    }
  }
})();
