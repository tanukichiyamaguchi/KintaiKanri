/**
 * KintaiKanri の Service Worker（ビルド時に vite.config.ts が dist/sw.js として生成する）。
 *
 * 目的: ホーム画面から開いたときの起動を速くし、電波が弱くても画面を表示できるようにする。
 *
 * - 画面の部品（assets/ 配下。ファイル名にハッシュ付き）: 端末の保存分を使う（cache-first）。
 *   内容が変われば名前も変わるので、古い部品が使われることはない。
 * - アプリの入口（HTML）: 常にネットワークから最新を取得する（network-first）。3 秒以内に
 *   応答が無いとき・オフラインのときだけ保存分を表示する。新しい版を公開すると、
 *   次にアプリを開いたときに自動で新しい版になる。
 * - サーバー（Google Apps Script）との通信には一切関与しない（打刻・保存は常に直接送る）。
 * - 新しい版の Service Worker は待たずに有効化し、古い版の保存分は削除する。
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = 'kintai-' + VERSION;
const HTML_TIMEOUT_MS = 3000;

function scopeUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 1 つの取得に失敗しても全体を止めない（電波が不安定なときの部分的な失敗に強くする）
      await Promise.all(
        PRECACHE.map(async (path) => {
          try {
            const url = scopeUrl(path);
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) await cache.put(url, res);
          } catch (e) {
            /* 次回の利用時に取得される */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('kintai-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 別のサイト（サーバー API など）への通信は触らない
  if (url.origin !== self.location.origin) return;
  if (!req.url.startsWith(self.registration.scope)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstHtml(req));
    return;
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, event));
});

function isIndexRequest(req) {
  const url = new URL(req.url);
  const scopePath = new URL(self.registration.scope).pathname;
  return url.pathname === scopePath || url.pathname === scopePath + 'index.html';
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function networkFirstHtml(req) {
  const cache = await caches.open(CACHE);
  const indexUrl = scopeUrl('index.html');
  try {
    const res = await withTimeout(fetch(req), HTML_TIMEOUT_MS);
    // 入口の HTML だけ保存する（GitHub Pages の 404.html によるページ移動はそのまま返す）
    if (res.ok && isIndexRequest(req)) cache.put(indexUrl, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(indexUrl);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return network;
}
