/* Ad loader. Every ad lives in its own sandboxed iframe (no top-navigation, no same-origin access),
   loads only when near the viewport, reserves its size first (no layout shift) and picks the banner
   size that fits the slot, so each ad fits every screen. If ads stay blank on your live site, delete the `sandbox` line. */
(()=>{
const B='https://bellnewyork.org/',
LB=[[728,90,'ae24ec8eecf2689bab694705036287d3'],[468,60,'66916e9eb7042894e37842779d0282e1'],[320,50,'04c8ea1a6864428387aad4f330226fea']],
RECT=[300,250,'b9852b158ff7a6ffaab4b619f8b34b24'],TALL=[160,300,'df6cf2c1fc0829cbed2139611418c36b'],NAT='2f88087dae2d3e0994727a99180a0187';
const wrap=b=>'<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>html,body{margin:0;background:transparent;overflow:hidden}</style>'+b;
const ban=([w,h,k])=>wrap('<script>atOptions={"key":"'+k+'","format":"iframe","height":'+h+',"width":'+w+',"params":{}};<\/script><script src="'+B+'22/'+k+'"><\/script>');
const nat=()=>wrap('<script async data-cfasync="false" src="'+B+'21/'+NAT+'"><\/script><div id="container-'+NAT+'"></div>');
const room=s=>{const c=getComputedStyle(s);return s.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight)};
function mount(s){
  const k=s.dataset.ad,box=s.querySelector('.ad__box');let spec,html;
  if(k==='lb'){const w=room(s);spec=LB.find(a=>a[0]<=w)||LB[2];html=ban(spec)}
  else if(k==='rect'){spec=RECT;html=ban(spec)}
  else if(k==='tall'){spec=TALL;html=ban(spec)}
  else{spec=['100%',320];html=nat()}
  const sig=spec.join('x');if(s._sig===sig)return;s._sig=sig;
  box.textContent='';box.classList.remove('ok');
  box.style.width=typeof spec[0]==='number'?spec[0]+'px':'100%';box.style.height=spec[1]+'px';
  const f=document.createElement('iframe');
  f.title='Advertisement';f.width=spec[0];f.height=spec[1];f.scrolling='no';
  f.sandbox='allow-scripts allow-popups allow-popups-to-escape-sandbox';
  f.referrerPolicy='strict-origin-when-cross-origin';f.srcdoc=html;
  f.onload=()=>box.classList.add('ok');box.append(f);
}
const io=new IntersectionObserver((es,o)=>es.forEach(e=>{
  if(!e.isIntersecting)return;const s=e.target;o.unobserve(s);mount(s);
  if(s.dataset.ad==='lb'){let t;new ResizeObserver(()=>{clearTimeout(t);t=setTimeout(()=>mount(s),250)}).observe(s)}
}),{rootMargin:'300px'});
document.querySelectorAll('[data-ad]').forEach(s=>io.observe(s));
})();
