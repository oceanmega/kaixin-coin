const CACHE = 'kaixin-coin-v3';
const FILES = ["./", "index.html", "game.js", "game.js?v=3", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "assets/atlas.png", "assets/atlas.json", "assets/bg/beach_far.jpg", "assets/bg/jiangnan_far.jpg", "assets/bg/jiangnan_mid.png", "assets/bg/k_color_hills.png", "assets/bg/k_color_trees.png", "assets/bg/k_fade_hills.png", "assets/bg/k_fade_trees.png", "assets/bg/night_far.jpg", "assets/bg/snow_far.jpg", "assets/sfx/big.mp3", "assets/sfx/buy.mp3", "assets/sfx/click.mp3", "assets/sfx/coin.mp3", "assets/sfx/coin2.mp3", "assets/sfx/combo.mp3", "assets/sfx/finish.mp3", "assets/sfx/hit.mp3", "assets/sfx/hit2.mp3", "assets/sfx/jump.mp3", "assets/sfx/jump2.mp3", "assets/sfx/land.mp3", "assets/sfx/pop.mp3", "assets/sfx/power.mp3", "assets/sfx/rain.mp3", "assets/sfx/star.mp3"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.includes('/assets/')){
    // 图片、音效：缓存优先（版本号变了会整包重下）
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; })));
    return;
  }
  // 页面和脚本：先拿网络上的新版，3 秒没回应或断网就用缓存
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(e.request, {ignoreSearch:true}).then(r => r || caches.match('index.html'));
    const timer = setTimeout(() => { fallback().then(r => { if (r && !done){ done = true; resolve(r); } }); }, 3000);
    fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); clearTimeout(timer); if (!done){ done = true; resolve(res); } })
      .catch(() => { clearTimeout(timer); fallback().then(r => { if (!done){ done = true; resolve(r || Response.error()); } }); });
  }));
});
