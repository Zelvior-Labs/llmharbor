# Generates every page from shared parts. Run: python3 build.py
import html
GH="https://github.com/zelvior/llmharbor"; REL=GH+"/releases"
I={k:f'<svg viewBox="0 0 24 24" aria-hidden="true">{v}</svg>' for k,v in {
"route":'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
"swap":'<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
"lock":'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
"bars":'<path d="M5 21V10M12 21V4M19 21v-7"/>',
"down":'<path d="M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5"/>',
"chat":'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
"vec":'<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="9" cy="18" r="2"/><path d="m8 6 8 2M7 8l2 8M17 10l-7 7"/>',
"img":'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
"mic":'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'}.items()}
NAV=[("index","Home"),("dashboard","Dashboard"),("features","Features"),("providers","Providers"),("how","How"),("download","Download"),("links","Links")]
HNAV=[("features","Features"),("providers","Providers"),("how","How"),("dashboard","Dashboard")]
SMART="https://ardance.org/4/c4141e29c163947b23a501084e9f33a8"
def slot(k,cls="s6"): return f'<aside class="tile ad ad--{k} {cls}" data-ad="{k}" aria-label="Advertisement"><span class="ad__tag">Advertisement</span><div class="ad__box"></div></aside>'
LINK=f'<a class="tile ad ad--link s6" href="{SMART}" target="_blank" rel="sponsored nofollow noopener noreferrer"><span class="ad__tag">Sponsored link</span><h3>Sponsored link</h3><p>Opens an advertiser’s website in a new tab. It is not part of LLMHarbor.</p><span class="btn">Visit sponsor ↗</span></a>'
# ads only where nobody is mid-task: never on Download, Privacy, Terms, Links or 404
ADS={"index":{1:slot("lb"),2:slot("tall","s2")+slot("rect","s2")+slot("native","s2")},"features":{0:slot("lb")+LINK},"providers":{0:slot("lb")},"how":{0:slot("lb")},"dashboard":{0:slot("lb")}}
def inject(slug,body):
    parts=body.split("</section>");out=[]
    for n,p in enumerate(parts[:-1]):
        out.append(p+"</section>");a=ADS.get(slug,{}).get(n)
        if a: out.append(f'<section class="adsec"><div class="wrap"><div class="bento">{a}</div></div></section>')
    return "".join(out)+parts[-1]
def page(slug,title,desc,body):
    body=inject(slug,body)
    nav="".join(f'<a href="{s}.html"{" aria-current=\"page\"" if s==slug else ""}>{n}</a>' for s,n in HNAV)
    url="https://llmharbor.vercel.app/"+("" if slug=="index" else slug+".html")
    ADJS='<script src="js/ads.js" defer></script>' if ADS.get(slug) else ''
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="description" content="{html.escape(desc)}"><link rel="canonical" href="{url}">
<meta name="theme-color" content="#0b0d10"><meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}"><meta property="og:image" content="https://llmharbor.vercel.app/og-image.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400..700&family=Saira+Semi+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches){{document.documentElement.classList.add("js");setTimeout(function(){{if(!document.documentElement.dataset.m)document.documentElement.classList.remove("js")}},3000)}}</script>
<link rel="stylesheet" href="css/style.css"></head><body id="top">
<header class="nav"><div class="wrap"><a class="logo" href="index.html"><i></i>LLMHarbor</a><nav class="links" aria-label="Main">{nav}</nav><a class="btn hot" href="download.html">Download</a></div></header>
<main>{body}</main>
<footer><div class="wrap"><div class="bento"><div class="s3"><a class="logo" href="index.html"><i></i>LLMHarbor</a><p class="mute" style="margin-top:12px;max-width:44ch">One OpenAI-compatible <code>/v1</code> API in front of the free tiers of 87 LLM providers. A modified version of freellmapi, made by Zelvior Labs.</p></div>
<ul class="s2"><li><a href="features.html">Features</a></li><li><a href="providers.html">Providers</a></li><li><a href="how.html">How it works</a></li><li><a href="download.html">Download</a></li></ul>
<ul class="s1" style="grid-column:span 1"><li><a href="{GH}">GitHub</a></li><li><a href="links.html">Links</a></li><li><a href="privacy.html">Privacy</a></li><li><a href="terms.html">Terms</a></li></ul></div>
<p class="legal">MIT licence · a modified version of tashfeenahmed/freellmapi · Zelvior Labs. Free, open source, yours to self-host. Thanks for stopping by.</p><a class="btn top" href="#top" style="margin-top:14px">Back to top ↑</a></div></footer><script src="js/motion.js" defer></script>{ADJS}</body></html>'''
def head(h,lead,pill=None): return f'<section><div class="wrap"><div class="head">{f"<span class=pill>{pill}</span>" if pill else ""}<h1>{h}</h1><p class="lead">{lead}</p></div>'
P={}
# ---- home
feat=[("route","Picks the best model","Every request goes to the fastest model that can serve it, from your ordered fallback chain.","s4 wide"),
("swap","Falls over on rate limits","When a provider throttles or hits its cap, the next one takes the request before your caller sees it.","s2"),
("lock","Keeps keys encrypted","Provider keys are encrypted at rest. Clients only ever see one unified key.","s2"),
("bars","Counts tokens per key","Usage is tracked per key against every provider's free-tier cap, so you never quietly pass a limit.","s4 wide")]
tiles="".join(f'<a class="tile {c}" href="features.html"><span class="ic">{I[i]}</span><h3>{t}</h3><p>{d}</p></a>' for i,t,d,c in feat)
P["index"]=("LLMHarbor: one OpenAI-compatible API for 1,313 free model endpoints","87 free LLM providers, 1,313 free model endpoints and 10.1 billion free tokens a month behind one OpenAI-compatible /v1 API. Free and open source.",
f'''<section><div class="wrap hero"><span class="pill">Open source · MIT</span><h1>Free LLMs,<br>one API</h1>
<p class="lead">LLMHarbor puts the free tiers of 87 LLM providers, 1,313 model endpoints and 10.1 billion tokens a month behind one OpenAI-compatible <code>/v1</code> endpoint. One key, one base URL, one bill of zero.</p>
<div class="row"><a class="btn hot" href="download.html">Download the app</a><a class="btn" href="{GH}/blob/main/docs/en/README.md">Read the docs</a></div></div></section>
<section><div class="wrap"><div class="bento">
<div class="tile s2"><span class="stat">87</span><p>free LLM providers</p></div><div class="tile s2"><span class="stat">1,313</span><p>free model endpoints</p></div><div class="tile s2"><span class="stat">10.1B</span><p>free tokens a month</p></div>
<div class="tile s4 wide"><div class="chat" role="img" aria-label="Example routed request"><div class="me">Summarise this 40-page report and save the key points.</div><div class="tool">Routing to gpt-4o-mini via OpenAI · fallback: claude-haiku</div><div class="bot">Done. The router took the fastest free endpoint and kept 6.4k tokens under the cap. <span class="mute">2.1s · 4,180 tokens</span></div></div></div>
<div class="tile s2"><h3>One base URL</h3><p>Point any OpenAI SDK at <code>http://localhost:3001/v1</code> and change nothing else.</p></div></div></div></section>
<section><div class="wrap"><div class="head"><h2>The router does the work. You keep one key.</h2></div><div class="bento">{tiles}</div></div></section>
<section><div class="wrap"><div class="bento"><div class="tile s4 wide"><h2>Runs on a machine from 2009.</h2><p>These screenshots come from a real Windows 7 x86 machine with 2 GB of RAM and an Atom N280 CPU. The router performs well on legacy hardware, not only on a modern server.</p><div class="row"><a class="btn" href="dashboard.html">See the dashboard</a></div></div><figure class="tile s2 shot"><img src="assets/shots/win7-1.png" alt="LLMHarbor routing dashboard on Windows 7 x86" width="1023" height="599" loading="lazy"><figcaption>Routing dashboard</figcaption></figure></div></div></section>''')
# ---- features
details=[("route","Picks the best model","Every request is routed to the fastest model that can serve it, chosen from your ordered fallback chain. In a typical week 62% of requests land on the first choice, 31% on the second and 7% on a fallback."),
("swap","Falls over on rate limits","When a provider throttles or hits its cap, the next provider takes the request before your caller sees it. Order is yours: for example OpenAI, then Anthropic, then Google."),
("lock","Keeps keys encrypted","Provider keys are encrypted at rest. Clients only ever see one unified key, minted in the dashboard."),
("bars","Counts tokens per key","Usage is tracked per key against every provider's free-tier cap, so you never quietly pass a limit.")]
P["features"]=("Features · LLMHarbor","Four jobs turn a pile of free-tier keys into one dependable endpoint.",head("The router does the work","Picking, failing over, hiding keys and counting tokens.")+'<div class="bento">'+"".join(f'<div class="tile s3"><span class="ic">{I[i]}</span><h3>{t}</h3><p>{d}</p></div>' for i,t,d in details)+f'</div><div class="row" style="margin-top:24px"><a class="btn hot" href="dashboard.html">Open the dashboard</a><a class="btn" href="how.html">Set it up</a></div></div></section>')
# ---- providers
eps=[("chat","Chat","/v1/chat/completions","routed to the best free chat model, with failover."),("vec","Embeddings","/v1/embeddings","vectors from the free embedding endpoints."),("img","Images","/v1/images/generations","image generation through the same router."),("mic","Audio","/v1/audio","speech endpoints, OpenAI-compatible.")]
P["providers"]=("Providers · LLMHarbor","The router holds the free tiers of 87 providers in one catalog and serves them through the same /v1 surface.",head("One endpoint, every provider","87 free tiers, one base URL, four endpoint families. Every one is OpenAI-compatible, so existing SDK code works unchanged.")+'<div class="bento">'+"".join(f'<div class="tile s3"><span class="ic">{I[i]}</span><h3>{n}</h3><p><code>{p}</code> — {d}</p></div>' for i,n,p,d in eps)+'<div class="tile s6"><h3>Also included</h3><p>An MCP server, plus a signed catalog feed that keeps the model list current. LLMHarbor is free and has no paid plan.</p></div></div></div></section>')
# ---- how
steps=[("Pick a model","Choose from the 1,313 free model endpoints in the catalog: chat, embeddings, image and audio."),("Add your keys","Paste the free-tier API keys for the providers you want. They stay encrypted at rest, and each client uses one unified key."),("Point your client at one URL","Set base_url to http://localhost:3001/v1 and send any OpenAI-compatible request. The router picks the provider.")]
code='from openai import OpenAI\n\nclient = OpenAI(\n    base_url="http://localhost:3001/v1",\n    api_key="sk-your-unified-key",\n)\n\nclient.chat.completions.create(\n    model="gpt-4o-mini",\n    messages=[{"role": "user", "content": "Hello"}],\n)'
P["how"]=("How it works · LLMHarbor","Three steps to your first route. No backend to host, no client to rewrite.",head("Three steps to your first route","Pick a model, add keys, point your app at one base URL.")+'<div class="bento">'+"".join(f'<div class="tile s2"><span class="ic">{n}</span><h3>{t}</h3><p>{d}</p></div>' for n,(t,d) in enumerate(steps,1))+f'<div class="tile s6"><h3>Change only the base URL</h3><p>Everything you already send to OpenAI keeps working.</p><pre><code>{html.escape(code)}</code></pre></div></div></div></section>')
# ---- download
dl=[("Windows 7 SP1 · portable zip","x86 — take this zip; the latest .exe will not run on Windows 7.","release-win7-v0.16.34-preview.1","s3"),("Android 8.0+ · .apk","armeabi-v7a, armeabi-v8a. Recommended: works on legacy and modern devices.","release-android-v0.16.34-preview.3","s3"),("Android 11+ · .apk","armeabi-v7a, armeabi-v8a.","release-android-v0.16.34-preview.2","s3"),("Android 11 · .apk","armeabi-v7a.","release-android-v0.16.34-preview.1","s3")]
P["download"]=("Download · LLMHarbor","Pick the release that matches your device.",head("Download LLMHarbor","Pick the release that matches your device. Windows 7 SP1 users must take the portable zip.")+'<div class="bento">'+"".join(f'<a class="tile {c}" href="{REL}#{a}"><span class="ic">{I["down"]}</span><h3>{t}</h3><p>{d}</p></a>' for t,d,a,c in dl)+f'<a class="tile s6" href="{REL}/tag/v0.16.34"><h3>Linux and macOS builds</h3><p>Every platform, one tag: Releases · v0.16.34.</p></a></div></div></section>')
# ---- dashboard
caps=["Routing dashboard","Models list","Provider keys","Dashboard view 4","Dashboard view 5","Dashboard view 6"]
specs=[("OS","Windows 7 x86 SP1"),("RAM","2 GB DDR2"),("CPU","Intel Atom N280 @ 1.66 GHz"),("Storage","HDD · 70 GB · ST9160310AS")]
P["dashboard"]=("Dashboard · LLMHarbor","Real screenshots of the LLMHarbor dashboard, taken on a Windows 7 x86 machine.",head("The dashboard","Every screenshot was taken on a real Windows 7 x86 machine.")+'<div class="bento">'+"".join(f'<figure class="tile s2 shot"><img src="assets/shots/win7-{n}.png" alt="LLMHarbor {c.lower()} on Windows 7 x86" width="1023" height="599" loading="lazy"><figcaption>{c} · Windows 7 x86</figcaption></figure>' for n,c in enumerate(caps,1))+"".join(f'<dl class="tile spec s3"><dt>{k}</dt><dd>{v}</dd></dl>' for k,v in specs[:2])+"".join(f'<dl class="tile spec s3"><dt>{k}</dt><dd>{v}</dd></dl>' for k,v in specs[2:])+'</div></div></section>')
# ---- links
L=[("npm","https://www.npmjs.com/~zelnpm"),("ORCID","https://orcid.org/0009-0009-2376-367X"),("YouTube","https://youtube.com/@zelviorhere"),("Linktree","https://linktr.ee/zelvior"),("Discord","https://discord.gg/UQfzQzymc"),("Donations","https://nowpayments.io/donation/zelviorhere"),("X","https://x.com/zelviorhere"),("Org site","https://zelviorlabs.vercel.app"),("Blog","https://zelvior.blogspot.com"),("GitHub org","https://github.com/Zelvior-Labs"),("GitHub user","https://github.com/zelvior")]
P["links"]=("Links · LLMHarbor","Every place to find LLMHarbor, Zelvior Labs and the project.",head("My links","Every place to find LLMHarbor, Zelvior Labs and the project.")+'<div class="bento">'+"".join(f'<a class="tile s2" href="{u}"><h3>{n}</h3><p class="mono">{u.split("//")[1].replace("www.","")}</p></a>' for n,u in L)+'</div></div></section>')
# ---- legal pages (text lives in content/*.html, copied verbatim from the original site)
LEGAL={
 "privacy": {
  "title": "Privacy Policy · LLMHarbor",
  "desc": "LLMHarbor privacy policy: the router is self-hosted, provider keys are encrypted at rest, and LLMHarbor has no hosted service that receives your requests.",
  "h1": "Privacy Policy.",
  "lead": "LLMHarbor is a self-hosted router. The short version: your provider keys stay on your machine, and nothing is sent to Zelvior Labs.",
  "h2": "What we hold, and where"
 },
 "terms": {
  "title": "Terms of Use · LLMHarbor",
  "desc": "LLMHarbor terms of use: the router is MIT-licensed software, the free tiers it routes remain subject to each provider's own terms, and LLMHarbor has no paid plan.",
  "h1": "Terms of Use.",
  "lead": "LLMHarbor is MIT-licensed software. These terms cover the project, and the free tiers it routes.",
  "h2": "The short version"
 }
}
for k,m in LEGAL.items():
    P[k]=(m["title"],m["desc"],head(m["h1"],m["lead"])+'<div class="tile prose"><h2>'+m["h2"]+'</h2>'+open("content/"+k+".html").read()+'</div></div></section>')
P["404"]=("Page not found · LLMHarbor","This page does not exist.",head("Page not found","That address does not match a page. Try the home page.")+'<div class="row"><a class="btn hot" href="index.html">Back home</a></div></div></section>')
for s,(t,d,b) in P.items(): open(s+".html","w").write(page(s,t,d,b))
pages=[s for s in P if s!="404"]
open("sitemap.xml","w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+"".join(f'<url><loc>https://llmharbor.vercel.app/{"" if s=="index" else s+".html"}</loc></url>\n' for s in pages)+'</urlset>\n')
