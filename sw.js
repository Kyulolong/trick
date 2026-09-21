/* 오프라인 서비스 워커.
 *
 * 앱 전체가 index.html 한 장이고 외부 의존성이 없다. 그 한 장과 아이콘만 쥐고 있으면
 * 비행기 모드에서도 다섯 게임이 전부 돈다 — 아이스브레이킹은 와이파이가 없는
 * 강의실·MT·지하 회의실에서 자주 꺼내기 때문이다.
 *
 * 여기 경로는 전부 상대경로다. 이 파일 주소(/trick/sw.js) 기준으로 풀리므로
 * './' 가 곧 /trick/ 이고, 슬러그를 한 번 더 적을 필요가 없다.
 */

// 아이콘·매니페스트를 바꿨을 때만 올린다. index.html 은 매번 네트워크에서 새로 받아
// 캐시를 덮어쓰므로, 앱 코드만 고친 배포에서는 건드리지 않아도 된다.
const CACHE = 'trick-v2';

const PRECACHE = [
  './',
  'manifest.webmanifest',
  'icon-16.png',
  'icon-32.png',
  'icon-180.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

// 행사장 와이파이는 "연결은 됐는데 안 오는" 경우가 많다. 끝까지 기다리면
// 오프라인보다 나쁘므로 이만큼 지나면 캐시로 넘어간다.
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req))
  );
});

// 페이지는 네트워크 우선이다. index.html 은 nginx 에서 no-cache 라 배포가 바로 보여야 하고,
// 캐시 우선으로 두면 새 버전이 한 번 늦게 뜬다. 받아온 것은 다음 오프라인을 위해 저장한다.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const shell = new URL('./', self.location).href;

  const fromNetwork = fetch(req).then(res => {
    // 컨테이너가 재배포 중이면 Traefik 이 502 를 준다. 그걸 보여주느니 캐시가 낫다.
    if (!res.ok) throw new Error('HTTP ' + res.status);
    // ?utm= 같은 쿼리가 붙어 와도 앱 셸 한 장으로 저장한다.
    cache.put(shell, res.clone());
    return res;
  });
  // 시간 초과로 캐시를 준 뒤에 실패하면 받는 쪽이 없다. 조용히 삼킨다.
  fromNetwork.catch(() => {});

  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  const cached = () => cache.match(shell);

  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
    // 시간 초과. 캐시가 있으면 그걸 주고, 없으면(첫 방문) 네트워크를 끝까지 기다린다.
    return (await cached()) || (await fromNetwork);
  } catch (e) {
    const hit = await cached();
    if (hit) return hit;
    throw e;
  }
}
