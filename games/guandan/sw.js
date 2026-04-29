// 自毁版 Service Worker（v2）
// 旧版会缓存 client → 阻止 loopback 加载。这一版主动清空所有缓存 +
// unregister 自己 + 强制刷新所有打开的页面。一旦激活完成，浏览器就
// 干干净净，访问者下次刷新就能拿到最新代码。
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    } catch (e) {}
    try {
      await self.registration.unregister();
    } catch (e) {}
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(client => {
        if (client.url) client.navigate(client.url);
      });
    } catch (e) {}
  })());
});

// 不拦截任何 fetch（pass-through）
