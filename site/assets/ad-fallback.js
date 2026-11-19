/* OSSLLMAPI — ad-slot fallback.
   The ad network injects its own iframe into each .ad-slot__frame. If it
   doesn't (network blocked, no inventory, slow load), a clearly-labelled
   placeholder shows so the slot never renders as a blank/broken box. When
   the iframe does arrive — even after the placeholder is up — it is shown
   and the placeholder is removed. */
(function () {
  function init() {
    var frames = document.querySelectorAll('.ad-slot__frame');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.dataset.adFallback) continue;
      frame.dataset.adFallback = '1';

      var ph = document.createElement('div');
      ph.className = 'ad-slot__ph';
      ph.setAttribute('aria-label', 'Advertisement');
      ph.textContent = 'Advertisement';
      ph.style.display = 'none';
      frame.appendChild(ph);

      var revealed = false;
      var timer = setTimeout(function () {
        if (!frame.querySelector('iframe')) {
          ph.style.display = '';
          revealed = true;
        }
      }, 5000);

      var obs = new MutationObserver(function () {
        if (frame.querySelector('iframe')) {
          clearTimeout(timer);
          if (revealed) { ph.remove(); }
          else { ph.style.display = 'none'; }
          obs.disconnect();
        }
      });
      obs.observe(frame, { childList: true });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
