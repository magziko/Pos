/* Service worker — يخلي التطبيق قابلًا للتثبيت ويفتح بدون إنترنت.
   - الصفحة الرئيسية: الشبكة أولًا (دائمًا أحدث نسخة) وعند الانقطاع النسخة المحفوظة.
   - المكتبات والخطوط الخارجية: تُحفظ بعد أول تحميل وتُحدَّث في الخلفية.
   - اتصالات Supabase والبيانات: لا تمر من هنا إطلاقًا (لا تُخزَّن). */
const VER = 'pos-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const PAGE_KEY = './index.html';                      // مفتاح واحد لكل روابط الصفحة (مع ?c= أو بدونه)
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function isAppPage(url) {
  const p = url.pathname;
  return p.endsWith('/') || p.endsWith('/index.html');
}
async function networkFirstPage(req) {
  const cache = await caches.open(VER);
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
    if (res && res.ok) cache.put(PAGE_KEY, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(PAGE_KEY)) || (await cache.match('./')) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VER);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function cacheFirst(req) {
  const cache = await caches.open(VER);
  return (await cache.match(req)) || fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' && isAppPage(url)) return e.respondWith(networkFirstPage(req));
    if (/\.(png|webmanifest)$/.test(url.pathname)) return e.respondWith(cacheFirst(req));
    return;                                            // أي ملف آخر (owner.html مثلًا) يمر طبيعيًا
  }
  if (LIB_HOSTS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(req));
  // أي نطاق آخر (Supabase وغيره): لا نتدخل
});
