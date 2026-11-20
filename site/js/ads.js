/* Ad loader. Every ad lives in its own iframe pointing at ad.html (a real URL on this site, so the network sees your domain),
   loads only when near the viewport, reserves its size first (no layout shift) and picks the banner
   size that fits the slot, so each ad fits every screen. */
(()=>{
const B='https://bellnewyork.org/',
LB=[[728,90,'ae24ec8eecf2689bab694705036287d3'],[468,60,'66916e9eb7042894e37842779d0282e1'],[320,50,'04c8ea1a6864428387aad4f330226fea']],
RECT=[300,250,'b9852b158ff7a6ffaab4b619f8b34b24'],TALL=[160,300,'df6cf2c1fc0829cbed2139611418c36b'],NAT='2f88087dae2d3e0994727a99180a0187';
const url=(t,k,w,h)=>'ad.html?t='+t+'&k='+k+'&w='+w+'&h='+h;
const room=s=>{const c=getComputedStyle(s);return s.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight)};
const filled=f=>{try{return !!f.contentDocument.querySelector('iframe,img,a,ins,video,[id^=container-] *')}catch(e){return true}};
function mount(s){
  const k=s.dataset.ad,box=s.querySelector('.ad__box');let spec,src;
  if(k==='lb'){const w=room(s);spec=LB.find(a=>a[0]<=w)||LB[2];src=url('b',spec[2],spec[0],spec[1])}
  else if(k==='rect'){spec=RECT;src=url('b',spec[2],spec[0],spec[1])}
  else if(k==='tall'){spec=TALL;src=url('b',spec[2],spec[0],spec[1])}
  else{spec=['100%',320,NAT];src=url('n',NAT,0,0)}
  const sig=spec.join('x');if(s._sig===sig)return;s._sig=sig;
  box.textContent='';box.classList.remove('ok');
  box.style.width=typeof spec[0]==='number'?spec[0]+'px':'100%';box.style.height=spec[1]+'px';
  const f=document.createElement('iframe');
  f.title='Advertisement';f.width=spec[0];f.height=spec[1];f.scrolling='no';
    f.referrerPolicy='strict-origin-when-cross-origin';f.src=src;
  f.onload=()=>box.classList.add('ok');box.append(f);
  // no fill after 8s (blocked, no inventory, domain not approved): remove the empty slot instead of showing a hole
  setTimeout(()=>{if(!filled(f))s.hidden=true},8000);
}
const io=new IntersectionObserver((es,o)=>es.forEach(e=>{
  if(!e.isIntersecting)return;const s=e.target;o.unobserve(s);mount(s);
  if(s.dataset.ad==='lb'){let t;new ResizeObserver(()=>{clearTimeout(t);t=setTimeout(()=>mount(s),250)}).observe(s)}
}),{rootMargin:'300px'});
document.querySelectorAll('[data-ad]').forEach(s=>io.observe(s));
})();
