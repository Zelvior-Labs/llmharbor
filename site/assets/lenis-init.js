/* Lenis (lenis.dev) smooth scroll for OSSLLMAPI.
   One instance on the window, a rAF loop, and anchor links routed through Lenis
   so in-page jumps land under the fixed nav. Under prefers-reduced-motion it is
   left off entirely: the page scrolls natively, nothing is smoothed. */
import Lenis from './lenis.mjs';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lenis = null;

if (!reduce) {
  lenis = new Lenis({
    lerp: 1,                 // snappy but smooth
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    respectReducedMotion: true,
  });

  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

  // stop the loop when the tab is hidden, resume when it returns
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) lenis.stop();
    else lenis.start();
  });
}

// anchor links: smooth-scroll to the target through Lenis, offset for the nav
const navH = () => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--nav');
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 72;
};

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href === '#') return;
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(target, { offset: -navH() - 8, duration: 1.1 });
  else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

window.lenis = lenis;
