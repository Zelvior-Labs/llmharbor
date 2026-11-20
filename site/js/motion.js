/* Motion: staggered arc reveals, squash-and-stretch hero, rubber-band buttons, origin-aware ripples,
   count-up peak, closing pop. Everything is interruptible (CSS transitions) and calms down after the first page of a visit. */
(()=>{
const d=document,de=d.documentElement;if(!de.classList.contains('js'))return;de.dataset.m=1;
try{if(sessionStorage.getItem('s'))de.classList.add('calm');sessionStorage.setItem('s',1)}catch(e){}
const calm=de.classList.contains('calm');
// hero headline -> words (stagger + squash/stretch drop)
d.querySelectorAll('.hero h1').forEach(h=>{let n=0;[...h.childNodes].forEach(x=>{if(x.nodeType!==3)return;const f=d.createDocumentFragment();
  x.textContent.split(/(\s+)/).forEach(t=>{if(!t)return;if(/^\s+$/.test(t))f.append(t);else{const s=d.createElement('span');s.className='w';s.style.setProperty('--i',n++);s.textContent=t;f.append(s)}});x.replaceWith(f)})});
// staggered arc reveal; stagger delay is dropped after settling so hover stays instant (Doherty)
const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;const el=e.target;io.unobserve(el);el.classList.add('in');
  setTimeout(()=>{el.classList.add('done');el.style.removeProperty('--i')},calm?400:1100)}),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
d.querySelectorAll('.hero>:not(h1),.head>*,.bento>*:not(.ad),.prose>*').forEach(el=>{
  el.style.setProperty('--i',Math.min([...el.parentNode.children].indexOf(el),5));el.classList.add('rv');io.observe(el)});
// peak: stats count up
if(!calm)d.querySelectorAll('.stat').forEach(el=>{
  const m=el.textContent.trim().match(/^([\d,.]+)(.*)$/);if(!m)return;
  const to=parseFloat(m[1].replace(/,/g,'')),dec=(m[1].split('.')[1]||'').length,fin=el.textContent,fmt=v=>v.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec})+m[2];
  el.textContent=fmt(0);
  new IntersectionObserver((es,o)=>{if(!es[0].isIntersecting)return;o.disconnect();const t0=performance.now();
    const step=t=>{const p=Math.min((t-t0)/900,1),e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;el.textContent=p<1?fmt(to*e):fin;if(p<1)requestAnimationFrame(step)};requestAnimationFrame(step)},{threshold:.6}).observe(el)});
// buttons: rubber-band magnet (resistance grows with distance, springs back past rest) + ripple from the press point
d.querySelectorAll('.btn').forEach(b=>{
  const f=v=>Math.sign(v)*(1-Math.exp(-Math.abs(v)/50))*8;
  b.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const r=b.getBoundingClientRect();
    b.classList.add('mag');b.style.setProperty('--mx',f(e.clientX-r.left-r.width/2)+'px');b.style.setProperty('--my',f(e.clientY-r.top-r.height/2)+'px')});
  b.addEventListener('pointerleave',()=>{b.classList.remove('mag');b.style.removeProperty('--mx');b.style.removeProperty('--my')});
  b.addEventListener('pointerdown',e=>{const r=b.getBoundingClientRect(),s=Math.hypot(r.width,r.height)*2,p=d.createElement('span');
    p.className='rp';p.style.cssText='left:'+(e.clientX-r.left)+'px;top:'+(e.clientY-r.top)+'px;width:'+s+'px;height:'+s+'px';b.append(p);setTimeout(()=>p.remove(),520)})});
// end: the footer logo pops in with follow-through
const lg=d.querySelector('footer .logo i');
if(lg)new IntersectionObserver((es,o)=>{if(es[0].isIntersecting){lg.classList.add('pop');o.disconnect()}},{threshold:1}).observe(lg);
})();
