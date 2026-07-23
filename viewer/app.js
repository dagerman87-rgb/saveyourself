/* 미르한 어항 뷰어 v2 (WO-012)
 * - 신의 창: truth 전면 표시 (공개 사이트와 완전 별개)
 * - 캐릭터: 코드 생성 픽셀 휴머노이드 (B트랙) — 4방향 + 걷기 2프레임 + 정지
 * - 마을 타일 v2: 지붕·벽·문, 길, 사과나무, 바다 물결, 밤 등불, 날씨 연출
 * - 성능: 탭 비활성 시 rAF·애니메이션 정지, 스프라이트는 부팅 시 1회 생성
 */
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (sel) => document.querySelector(sel);
const el = (name, attrs = {}, text) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};
const div = (cls, html) => { const d = document.createElement('div'); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= 픽셀 스프라이트 (B트랙: 코드 생성) ================= */
/* 12x16 그리드. 방향: down/up/right (left는 right 미러). 프레임: idle, walk1, walk2 */
const SPRITE_SPECS = {
  'rohan-the-smith':       { skin: '#c99b72', hair: '#3a2e26', top: '#7a4a33', bottom: '#4a3a30', shoes: '#2e2620', acc: 'rohan', h: 36 },
  'mira-the-baker':        { skin: '#d8ab82', hair: '#5a3d28', top: '#b5804f', bottom: '#6e4f3a', shoes: '#4a3626', acc: 'mira', h: 34 },
  'yeron-the-fisher':      { skin: '#b98f6c', hair: '#b8b4a8', top: '#3f5d73', bottom: '#333b45', shoes: '#26221e', acc: 'yeron', h: 33 },
  'isen-the-scribe':       { skin: '#cfa77e', hair: '#241f2e', top: '#3c3450', bottom: '#3c3450', shoes: '#241f2e', acc: 'isen', h: 35 },
  'kalla-the-market-warden': { skin: '#c79c74', hair: '#2c2620', top: '#4d6b50', bottom: '#3a4438', shoes: '#2a241e', acc: 'kalla', h: 34 },
  'taru-of-the-saltfields':  { skin: '#c2946a', hair: '#3f3226', top: '#8a8564', bottom: '#6b6350', shoes: '#c2946a', acc: 'taru', h: 27 },
  _anon:                   { skin: '#9a9a9a', hair: '#6f6f6f', top: '#7f7f7f', bottom: '#666', shoes: '#555', acc: null, h: 32 },
};

function paintFrame(spec, dir, frame) { // frame: 0 idle, 1/2 걷기
  const cv = document.createElement('canvas');
  cv.width = 12; cv.height = 16;
  const c = cv.getContext('2d');
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const S = spec;
  const bent = S.acc === 'yeron' ? 1 : 0;       // 굽은 등: 머리 1px 아래로
  const robe = S.acc === 'isen';                 // 두루마기: 다리 없음
  const broad = S.acc === 'rohan' ? 1 : 0;       // 넓은 어깨
  // 팔·다리 스윙
  const armL = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  const armR = -armL;
  const legL = frame === 1 ? 1 : 0;
  const legR = frame === 2 ? 1 : 0;

  if (dir === 'down' || dir === 'up') {
    // 머리
    px(3, 1 + bent, 6, 4, S.hair);
    if (dir === 'down') {
      px(4, 2 + bent, 4, 3, S.skin);                 // 얼굴
      px(4, 3 + bent, 1, 1, '#222'); px(7, 3 + bent, 1, 1, '#222'); // 눈
      px(3, 1 + bent, 6, 1, S.hair);                 // 앞머리
    }
    px(5, 5 + bent, 2, 1, S.skin);                   // 목
    // 몸통
    px(3 - broad, 6 + bent, 6 + broad * 2, 5, S.top);
    // 팔 (스윙)
    px(2 - broad, 6 + bent + armL, 1, 4, S.top); px(2 - broad, 10 + bent + armL, 1, 1, S.skin);
    px(9 + broad, 6 + bent + armR, 1, 4, S.top); px(9 + broad, 10 + bent + armR, 1, 1, S.skin);
    if (robe) {
      px(3, 11, 6, 4, S.top); px(3, 14, 6, 1, '#2c2640'); // 두루마기 자락
    } else {
      px(4, 11, 2, 3 + legL, S.bottom); px(6, 11, 2, 3 + legR, S.bottom);
      px(4, 14 + legL, 2, 1, S.shoes); px(6, 14 + legR, 2, 1, S.shoes);
    }
    // 소품 (정면/배면)
    if (S.acc === 'rohan') { px(4, 7 + bent, 4, 4, '#5c3d24'); px(5, 6 + bent, 2, 1, '#5c3d24'); } // 가죽 앞치마
    if (S.acc === 'mira') { px(4, 7, 4, 4, '#e8dcc8'); if (dir === 'down') px(5, 6, 1, 1, '#fff'); } // 앞치마 + 조개껍데기
    if (S.acc === 'yeron') { px(2, 0 + bent, 8, 1, '#6e5a3a'); px(3, 1 + bent, 6, 1, '#8a7148'); // 챙 모자
      px(10, 3, 1, 11, '#7a5c38'); px(9, 13, 3, 2, '#8a6a42'); }                                  // 지팡이 노
    if (S.acc === 'isen' && dir === 'down') { px(9, 8, 2, 1, '#e8e0cc'); px(9, 9, 2, 1, '#d8ccb0'); } // 두루마리
    if (S.acc === 'kalla') { px(3, 10, 6, 1, '#2a241c'); if (dir === 'down') px(8, 9, 2, 2, '#7a5a34'); } // 허리끈 + 장부
    if (dir === 'up') px(3, 1 + bent, 6, 4, S.hair); // 뒷머리 덮기
  } else { // right (left는 미러)
    px(4, 1 + bent, 5, 4, S.hair);
    px(7, 2 + bent, 2, 3, S.skin); px(8, 3 + bent, 1, 1, '#222'); // 옆얼굴 + 눈
    px(5, 5 + bent, 2, 1, S.skin);
    px(4, 6 + bent, 4 + broad, 5, S.top);
    px(5 + armL, 7 + bent, 2, 3, S.top); px(5 + armL, 10 + bent, 2, 1, S.skin); // 팔
    if (robe) {
      px(4, 11, 4, 4, S.top); px(4, 14, 4, 1, '#2c2640');
    } else {
      px(4, 11, 2, 3 + legR, S.bottom); px(6, 11, 2, 3 + legL, S.bottom);
      px(4, 14 + legR, 2, 1, S.shoes); px(6, 14 + legL, 2, 1, S.shoes);
    }
    if (S.acc === 'rohan') { px(5, 7 + bent, 3, 4, '#5c3d24'); }
    if (S.acc === 'mira') { px(5, 7, 3, 4, '#e8dcc8'); px(7, 6, 1, 1, '#fff'); }
    if (S.acc === 'yeron') { px(3, 0 + bent, 8, 1, '#6e5a3a'); px(4, 1 + bent, 6, 1, '#8a7148');
      px(10, 3, 1, 11, '#7a5c38'); px(9, 13, 3, 2, '#8a6a42'); }
    if (S.acc === 'isen') { px(8, 8, 2, 2, '#e8e0cc'); }
    if (S.acc === 'kalla') { px(4, 10, 4, 1, '#2a241c'); px(7, 9, 2, 2, '#7a5a34'); }
  }
  return cv;
}
function mirror(cv) {
  const m = document.createElement('canvas');
  m.width = cv.width; m.height = cv.height;
  const c = m.getContext('2d');
  c.translate(cv.width, 0); c.scale(-1, 1); c.drawImage(cv, 0, 0);
  return m;
}
const SPRITES = {}; // id → {down:[u,u,u], up:[...], right:[...], left:[...], h}
function buildSprites() {
  for (const [id, spec] of Object.entries(SPRITE_SPECS)) {
    const set = { h: spec.h, w: spec.h * 12 / 16 };
    for (const dir of ['down', 'up', 'right']) set[dir] = [0, 1, 2].map((f) => paintFrame(spec, dir, f).toDataURL());
    set.left = [0, 1, 2].map((f) => mirror(paintFrame(spec, 'right', f)).toDataURL());
    SPRITES[id] = set;
  }
}

/* ================= 지도 정의 ================= */
const ZONES = [
  { id: 'fields', x: 0, y: 0, w: 620, h: 210, fill: '#4d5a3c' },
  { id: 'hill', x: 620, y: 0, w: 380, h: 300, fill: '#63604c', label: '언덕 구역', lx: 810, ly: 34 },
  { id: 'port', x: 0, y: 210, w: 620, h: 310, fill: '#66594a', label: '항구 구역', lx: 70, ly: 244 },
  { id: 'mudflat', x: 620, y: 300, w: 380, h: 220, fill: '#77684e', label: '갯벌 구역', lx: 810, ly: 330 },
  { id: 'sea', x: 0, y: 520, w: 1000, h: 120, fill: '#2b5d78' },
];
const BUILDINGS = [
  { slug: 'temple', name: '신전', x: 750, y: 80, w: 130, h: 85 },
  { slug: 'oldtown', name: '구시가', x: 645, y: 190, w: 105, h: 70 },
  { slug: 'smithy', name: '대장간', x: 140, y: 315, w: 95, h: 70 },
  { slug: 'apple-yard', name: '사과나무 마당', x: 248, y: 328, w: 50, h: 50 },
  { slug: 'bakery', name: '빵집', x: 330, y: 295, w: 85, h: 62 },
  { slug: 'market', name: '시장', x: 430, y: 375, w: 140, h: 95 },
  { slug: 'port-lane', name: '항구 골목', x: 302, y: 412, w: 68, h: 52 },
  { slug: 'fisher-hut', name: '예론의 오두막', x: 80, y: 462, w: 55, h: 45 },
  { slug: 'dock', name: '부두', x: 160, y: 505, w: 240, h: 48 },
  { slug: 'saltfields', name: '소금밭', x: 690, y: 425, w: 190, h: 80 },
  { slug: 'mudflat-huts', name: '갯벌 움막', x: 888, y: 352, w: 78, h: 58 },
];
const PLACE_ALIAS = {
  harbor: 'dock', pier: 'dock', mudflat: 'saltfields', hill: 'temple', street: 'port-lane',
};
const placeOf = (slug) => BUILDINGS.find((b) => b.slug === (PLACE_ALIAS[slug] ?? slug)) ?? BUILDINGS.find((b) => b.slug === 'market');
const randIn = (b) => ({ x: b.x + 10 + Math.random() * (b.w - 20), y: b.y + b.h + 10 + Math.random() * 16 });
const doorPoint = (slug) => { const b = placeOf(slug); return { x: b.x + b.w / 2, y: b.y + b.h + 9 }; };

/* 시드 난수 — 배치가 리로드마다 흔들리지 않게 */
const rng = (() => { let s = 20260724; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();

/* ---------- 환경 디테일 (WO-013 — 연출 계층, 세계 데이터 아님) ---------- */
const PASTURE = { x: 630, y: 262, w: 82, h: 34 };   // 구시가 비탈 목장
const GARDEN = { x: 334, y: 260, w: 78, h: 30 };    // 빵집 뒤 텃밭

function inRect(x, y, r, pad = 6) { return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad; }
function clearOfBuildings(x, y) {
  return !BUILDINGS.some((b) => inRect(x, y, b, 14)) && !inRect(x, y, PASTURE) && !inRect(x, y, GARDEN);
}
function zoneAt(x, y) { return ZONES.find((z) => z.id !== 'sea' && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h)?.id; }

function drawFenceRect(g, r, opts = {}) {
  const post = '#8a7454', rail = '#6e5c42';
  const step = 13;
  const gate = opts.gate; // 'bottom' | 'left' — 중앙에 틈
  const seg = (x1, y1, x2, y2, skipMid) => {
    const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (skipMid && t > 0.38 && t < 0.62) continue;
      g.appendChild(el('rect', { x: x1 + (x2 - x1) * t - 1.5, y: y1 + (y2 - y1) * t - 4, width: 3, height: 7, fill: post }));
    }
    for (const dy of [-2.5, 0.5]) {
      if (skipMid) {
        g.appendChild(el('line', { x1, y1: y1 + dy, x2: x1 + (x2 - x1) * 0.38, y2: y1 + (y2 - y1) * 0.38 + dy, stroke: rail, 'stroke-width': 1.6 }));
        g.appendChild(el('line', { x1: x1 + (x2 - x1) * 0.62, y1: y1 + (y2 - y1) * 0.62 + dy, x2, y2: y2 + dy, stroke: rail, 'stroke-width': 1.6 }));
      } else g.appendChild(el('line', { x1, y1: y1 + dy, x2, y2: y2 + dy, stroke: rail, 'stroke-width': 1.6 }));
    }
  };
  seg(r.x, r.y, r.x + r.w, r.y);
  seg(r.x, r.y + r.h, r.x + r.w, r.y + r.h, gate === 'bottom');
  seg(r.x, r.y, r.x, r.y + r.h, gate === 'left');
  seg(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
}
function drawPine(g, x, y, s = 1) {
  g.appendChild(el('rect', { x: x - 2 * s, y: y - 4 * s, width: 4 * s, height: 8 * s, fill: '#5e4832' }));
  for (let i = 0; i < 3; i++) {
    const w = (18 - i * 4.5) * s, ty = y - (6 + i * 8) * s;
    g.appendChild(el('path', { d: `M ${x - w / 2} ${ty} L ${x} ${ty - 11 * s} L ${x + w / 2} ${ty} Z`, fill: i % 2 ? '#39543a' : '#2f4831', stroke: 'rgba(0,0,0,0.2)' }));
  }
}
function drawGroundDetail(g) {
  // 톤 변주 패치
  for (let i = 0; i < 26; i++) {
    const x = rng() * 1000, y = rng() * 510;
    const z = zoneAt(x, y);
    if (!z || !clearOfBuildings(x, y)) continue;
    const col = { fields: '#46523a', hill: '#5a584a', port: '#6e6050', mudflat: '#6e5f48' }[z];
    g.appendChild(el('ellipse', { cx: x, cy: y, rx: 24 + rng() * 34, ry: 12 + rng() * 16, fill: col, opacity: 0.35 }));
  }
  // 풀포기·들꽃 (초원·언덕 위주, 항구는 성기게)
  for (let i = 0; i < 150; i++) {
    const x = rng() * 1000, y = rng() * 512;
    const z = zoneAt(x, y);
    if (!z || !clearOfBuildings(x, y)) continue;
    if (z === 'port' && rng() < 0.55) { // 모래 섞임
      if (rng() < 0.4) g.appendChild(el('circle', { cx: x, cy: y, r: 1.2 + rng(), fill: '#8d7f68', opacity: 0.7 }));
      continue;
    }
    if (z === 'mudflat' && rng() < 0.5) continue;
    const gc = z === 'hill' ? '#42592f' : '#4f6b39';
    const t = el('g');
    for (const dx of [-2, 0, 2]) t.appendChild(el('line', { x1: x + dx, y1: y, x2: x + dx * 1.6, y2: y - 4 - rng() * 3, stroke: gc, 'stroke-width': 1.1 }));
    g.appendChild(t);
    if (rng() < 0.18) g.appendChild(el('circle', { cx: x + 3, cy: y - 3, r: 1.4, fill: rng() < 0.5 ? '#e8e3c8' : '#d9b84a' }));
  }
  // 잡목·덤불
  for (let i = 0; i < 9; i++) {
    const x = 30 + rng() * 940, y = 30 + rng() * 460;
    if (!clearOfBuildings(x, y) || zoneAt(x, y) === 'mudflat') continue;
    const s = 0.7 + rng() * 0.6;
    g.appendChild(el('ellipse', { cx: x, cy: y + 3 * s, rx: 10 * s, ry: 4 * s, fill: 'rgba(0,0,0,0.18)' }));
    g.appendChild(el('circle', { cx: x - 4 * s, cy: y, r: 6 * s, fill: '#465f35' }));
    g.appendChild(el('circle', { cx: x + 4 * s, cy: y - 1, r: 6.5 * s, fill: '#516b3c' }));
    g.appendChild(el('circle', { cx: x, cy: y - 4 * s, r: 5.5 * s, fill: '#5b7843' }));
  }
  // 언덕 소나무 4그루
  for (const [px, py, s] of [[648, 92, 1.1], [706, 44, 0.9], [924, 74, 1.2], [956, 168, 0.95]]) drawPine(g, px, py, s);
  // 바위
  for (const [x, y, s] of [[68, 250, 1], [590, 240, 0.8], [860, 300, 1.1], [130, 90, 0.9]]) {
    g.appendChild(el('path', { d: `M ${x} ${y} l ${8 * s} ${-5 * s} l ${9 * s} ${3 * s} l ${2 * s} ${7 * s} l ${-14 * s} ${3 * s} Z`, fill: '#7b7568', stroke: '#57524a' }));
    g.appendChild(el('path', { d: `M ${x + 3 * s} ${y - 2 * s} l ${6 * s} ${-2 * s} l ${4 * s} ${3 * s}`, fill: 'none', stroke: '#918b7d', 'stroke-width': 1 }));
  }
  // 갯벌: 물웅덩이 + 갈대숲
  for (const [x, y, rx, ry] of [[652, 470, 22, 8], [742, 508, 18, 6], [828, 490, 26, 9]]) {
    g.appendChild(el('ellipse', { cx: x, cy: y, rx, ry, fill: '#4e5a52', opacity: 0.75 }));
    g.appendChild(el('ellipse', { cx: x - 3, cy: y - 1, rx: rx * 0.6, ry: ry * 0.5, fill: '#6a7a6e', opacity: 0.5 }));
  }
  for (let i = 0; i < 30; i++) {
    const x = 628 + rng() * 350, y = 452 + rng() * 62;
    if (!clearOfBuildings(x, y)) continue;
    const r = el('g');
    for (const dx of [-2, 0, 2]) {
      r.appendChild(el('line', { x1: x + dx, y1: y, x2: x + dx * 1.8, y2: y - 9 - rng() * 5, stroke: '#8a8a58', 'stroke-width': 1.2 }));
      r.appendChild(el('ellipse', { cx: x + dx * 1.8, cy: y - 10 - rng() * 4, rx: 1.2, ry: 3, fill: '#a89a68' }));
    }
    g.appendChild(r);
  }
  // 밭두렁 (텃밭 아래 짧은 이랑 결)
  for (let i = 0; i < 3; i++)
    g.appendChild(el('line', { x1: 424, y1: 268 + i * 8, x2: 470, y2: 268 + i * 8, stroke: '#5a4f3e', 'stroke-width': 2.4, opacity: 0.5, 'stroke-linecap': 'round' }));
}
function drawProps(g) {
  // 텃밭 (빵집 뒤): 이랑 + 채소
  g.appendChild(el('rect', { x: GARDEN.x, y: GARDEN.y, width: GARDEN.w, height: GARDEN.h, fill: '#5c4c38', rx: 3 }));
  for (let r = 0; r < 3; r++) {
    g.appendChild(el('line', { x1: GARDEN.x + 5, y1: GARDEN.y + 7 + r * 9, x2: GARDEN.x + GARDEN.w - 5, y2: GARDEN.y + 7 + r * 9, stroke: '#4a3c2c', 'stroke-width': 3.5, 'stroke-linecap': 'round' }));
    for (let c = 0; c < 7; c++)
      g.appendChild(el('circle', { cx: GARDEN.x + 9 + c * 10, cy: GARDEN.y + 7 + r * 9, r: 2.2, fill: r === 1 ? '#6f8f45' : '#587a3e' }));
  }
  drawFenceRect(g, GARDEN, { gate: 'bottom' });
  // 목장 (구시가 비탈)
  g.appendChild(el('rect', { x: PASTURE.x, y: PASTURE.y, width: PASTURE.w, height: PASTURE.h, fill: '#55603f', rx: 4, opacity: 0.8 }));
  drawFenceRect(g, PASTURE, { gate: 'left' });
  // 부두: 통·상자·그물 걸이
  for (const [x, y] of [[168, 512], [180, 516], [378, 512]]) {
    g.appendChild(el('circle', { cx: x, cy: y, r: 5.5, fill: '#7a5c38', stroke: '#4e3a22' }));
    g.appendChild(el('line', { x1: x - 5, y1: y - 1.5, x2: x + 5, y2: y - 1.5, stroke: '#4e3a22' }));
    g.appendChild(el('line', { x1: x - 5, y1: y + 1.5, x2: x + 5, y2: y + 1.5, stroke: '#4e3a22' }));
  }
  for (const [x, y] of [[356, 514], [345, 519]]) {
    g.appendChild(el('rect', { x, y, width: 11, height: 9, fill: '#8a6f48', stroke: '#5a4830' }));
    g.appendChild(el('line', { x1: x, y1: y + 4.5, x2: x + 11, y2: y + 4.5, stroke: '#5a4830' }));
  }
  { // 그물 걸이
    const nx = 220, ny = 498;
    g.appendChild(el('line', { x1: nx, y1: ny, x2: nx, y2: ny - 14, stroke: '#5e4c33', 'stroke-width': 2.5 }));
    g.appendChild(el('line', { x1: nx + 26, y1: ny, x2: nx + 26, y2: ny - 14, stroke: '#5e4c33', 'stroke-width': 2.5 }));
    g.appendChild(el('line', { x1: nx, y1: ny - 13, x2: nx + 26, y2: ny - 13, stroke: '#5e4c33', 'stroke-width': 2 }));
    for (let i = 0; i < 5; i++) g.appendChild(el('line', { x1: nx + 3 + i * 5, y1: ny - 12, x2: nx + 5 + i * 5, y2: ny - 2, stroke: '#8a7a5a', 'stroke-width': 0.8, 'stroke-dasharray': '2 1.5' }));
  }
  // 시장 뒤 수레
  { const cx = 578, cy = 392;
    g.appendChild(el('rect', { x: cx, y: cy, width: 26, height: 13, fill: '#7c5f3e', stroke: '#54462f', rx: 2 }));
    g.appendChild(el('line', { x1: cx + 26, y1: cy + 3, x2: cx + 36, y2: cy + 1, stroke: '#54462f', 'stroke-width': 2 }));
    g.appendChild(el('circle', { cx: cx + 6, cy: cy + 14, r: 4.5, fill: 'none', stroke: '#3f3627', 'stroke-width': 2 }));
    g.appendChild(el('circle', { cx: cx + 20, cy: cy + 14, r: 4.5, fill: 'none', stroke: '#3f3627', 'stroke-width': 2 }));
  }
  // 빨랫줄 (항구 골목 옆) — 빨래는 낮에만 (.laundry)
  { const x1 = 246, y1 = 428, x2 = 296, y2 = 424;
    g.appendChild(el('line', { x1, y1: y1 - 14, x2: x1, y2: y1, stroke: '#5e4c33', 'stroke-width': 2.5 }));
    g.appendChild(el('line', { x1: x2, y1: y2 - 14, x2, y2, stroke: '#5e4c33', 'stroke-width': 2.5 }));
    g.appendChild(el('path', { d: `M ${x1} ${y1 - 13} Q ${(x1 + x2) / 2} ${y1 - 9} ${x2} ${y2 - 13}`, fill: 'none', stroke: '#c8c0a8', 'stroke-width': 1 }));
    const cols = ['#c8b89a', '#9db0b5', '#c2a4a0'];
    cols.forEach((c, i) => g.appendChild(el('rect', { x: x1 + 8 + i * 14, y: y1 - 12 + i, width: 9, height: 8, fill: c, class: 'laundry', rx: 1 })));
  }
  // 우물 (항구 골목께)
  { const wx = 388, wy = 452;
    g.appendChild(el('circle', { cx: wx, cy: wy, r: 8, fill: '#8a8578', stroke: '#57524a', 'stroke-width': 2 }));
    g.appendChild(el('circle', { cx: wx, cy: wy, r: 4, fill: '#3a4448' }));
    g.appendChild(el('line', { x1: wx - 7, y1: wy - 6, x2: wx - 7, y2: wy - 16, stroke: '#5e4c33', 'stroke-width': 2 }));
    g.appendChild(el('line', { x1: wx + 7, y1: wy - 6, x2: wx + 7, y2: wy - 16, stroke: '#5e4c33', 'stroke-width': 2 }));
    g.appendChild(el('path', { d: `M ${wx - 10} ${wy - 15} L ${wx} ${wy - 21} L ${wx + 10} ${wy - 15} Z`, fill: '#6e5a42', stroke: '#4a3c28' }));
  }
}
function drawGulls(g) {
  for (const [cx, cy, r, dur, s] of [[280, 460, 46, 26, 1], [300, 445, 64, 34, 0.8], [255, 470, 30, 20, 0.7]]) {
    const orbit = el('g', { class: 'gull-orbit', style: `transform-origin:${cx}px ${cy}px; animation-duration:${dur}s` });
    orbit.appendChild(el('path', {
      d: `M ${cx + r - 5} ${cy} q 3 -3 5 0 q 2 -3 5 0`,
      fill: 'none', stroke: '#e8e6dc', 'stroke-width': 1.6 * s, 'stroke-linecap': 'round',
    }));
    g.appendChild(orbit);
  }
}

/* ---------- 건물 그리기 (지붕·벽·문 탑뷰) ---------- */
function drawBuilding(g, b) {
  const grp = el('g');
  const add = (n) => grp.appendChild(n);
  const wall = (x, y, w, h, col) => add(el('rect', { x, y, width: w, height: h, fill: col, stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1 }));
  const roof = (x, y, w, h, col, dark) => {
    add(el('rect', { x, y, width: w, height: h, fill: col, stroke: 'rgba(0,0,0,0.4)', 'stroke-width': 1.2, rx: 2 }));
    add(el('line', { x1: x + 3, y1: y + h / 2, x2: x + w - 3, y2: y + h / 2, stroke: dark, 'stroke-width': 1.5 })); // 용마루
  };
  const door = (x, y, w = 8, h = 5) => add(el('rect', { x, y, width: w, height: h, fill: '#3a2c1e', stroke: '#241a10' }));
  const winlight = (x, y) => add(el('rect', { x, y, width: 7, height: 6, class: 'window-light', rx: 1 }));
  const chimney = (x, y, smokeCls) => {
    add(el('rect', { x, y, width: 10, height: 10, fill: '#6a6a6a', stroke: '#3c3c3c' }));
    add(el('rect', { x: x + 2, y: y + 2, width: 6, height: 6, fill: '#2c2c2c' }));
    for (let i = 0; i < 3; i++) add(el('circle', { cx: x + 5, cy: y, r: 3 + i, class: `smoke ${smokeCls}`, style: `animation-delay:${i * 1.3}s` }));
  };
  switch (b.slug) {
    case 'temple': { // 돌 신전: 기단 + 열주 + 박공지붕
      wall(b.x - 6, b.y + b.h - 10, b.w + 12, 14, '#8f8b80');           // 기단·계단
      add(el('rect', { x: b.x - 6, y: b.y + b.h + 4, width: b.w + 12, height: 3, fill: '#7c786e' }));
      roof(b.x, b.y, b.w, b.h - 8, '#b3aea1', '#8f8a7c');
      for (let i = 0; i < 5; i++) add(el('rect', { x: b.x + 8 + i * ((b.w - 22) / 4), y: b.y + b.h - 12, width: 6, height: 10, fill: '#d8d3c4', stroke: '#9a958a' }));
      winlight(b.x + 20, b.y + 14); winlight(b.x + b.w - 28, b.y + 14);
      break;
    }
    case 'oldtown': { // 붉은 기와 두 채
      roof(b.x, b.y + 8, 56, 48, '#8a5a44', '#6e4534');
      roof(b.x + 50, b.y, 55, 42, '#96654c', '#75503c');
      door(b.x + 22, b.y + 56); door(b.x + 74, b.y + 42);
      winlight(b.x + 8, b.y + 22); winlight(b.x + 82, b.y + 12);
      break;
    }
    case 'smithy': { // 어두운 지붕 + 굴뚝 연기
      wall(b.x, b.y + b.h - 12, b.w, 12, '#54443a');
      roof(b.x - 3, b.y, b.w + 6, b.h - 10, '#4e423a', '#382e28');
      door(b.x + b.w / 2 - 5, b.y + b.h - 1, 10, 6);
      winlight(b.x + 10, b.y + 16); winlight(b.x + b.w - 18, b.y + 16);
      add(el('rect', { x: b.x + b.w - 26, y: b.y + b.h + 2, width: 18, height: 6, fill: '#3a3a3a' })); // 모루대
      chimney(b.x + b.w - 22, b.y - 6, 'smoke-dark');
      break;
    }
    case 'apple-yard': { // 울타리 + 사과나무 (로한 서사의 성지)
      add(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: '#55673f', opacity: 0.6, rx: 4 }));
      drawFenceRect(grp, { x: b.x - 3, y: b.y - 2, w: b.w + 6, h: b.h + 4 }, { gate: 'left' });
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      add(el('ellipse', { cx: cx + 3, cy: cy + 16, rx: 16, ry: 5, fill: 'rgba(0,0,0,0.25)' }));          // 그늘
      add(el('rect', { x: cx - 3, y: cy + 2, width: 6, height: 14, fill: '#6e5138', stroke: '#4e3a28' })); // 줄기
      const canopy = el('g', { class: 'tree-sway' });
      canopy.appendChild(el('circle', { cx: cx - 9, cy: cy - 4, r: 11, fill: '#4e7038' }));
      canopy.appendChild(el('circle', { cx: cx + 9, cy: cy - 4, r: 11, fill: '#557a3d' }));
      canopy.appendChild(el('circle', { cx, cy: cy - 12, r: 12, fill: '#5f8a44' }));
      canopy.appendChild(el('circle', { cx: cx - 4, cy: cy - 7, r: 8, fill: '#6b9a4e' }));
      for (const [ax, ay] of [[-8, -10], [5, -14], [10, -3], [-2, -1], [3, -7]])
        canopy.appendChild(el('circle', { cx: cx + ax, cy: cy + ay, r: 1.8, fill: '#c8453a' }));          // 사과
      add(canopy);
      break;
    }
    case 'bakery': { // 따뜻한 지붕 + 굴뚝
      wall(b.x, b.y + b.h - 11, b.w, 11, '#8a6d4c');
      roof(b.x - 3, b.y, b.w + 6, b.h - 9, '#a97e52', '#8a6540');
      door(b.x + b.w / 2 - 5, b.y + b.h, 10, 6);
      winlight(b.x + 9, b.y + 14); winlight(b.x + b.w - 17, b.y + 14);
      chimney(b.x + 8, b.y - 6, 'smoke-warm');
      break;
    }
    case 'market': { // 차양 좌판 세 채
      add(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: '#6e614c', rx: 4, opacity: 0.7 }));
      for (let i = 0; i < 3; i++) {
        const sx = b.x + 8 + i * 44, sy = b.y + 10 + (i % 2) * 34;
        add(el('rect', { x: sx, y: sy + 10, width: 36, height: 16, fill: '#7c6a4e', stroke: '#54462f' }));
        const awn = el('g');
        for (let s = 0; s < 6; s++) awn.appendChild(el('rect', { x: sx - 2 + s * 6.7, y: sy, width: 6.7, height: 9, fill: s % 2 ? '#b9a06a' : (i === 1 ? '#8c5a48' : '#5e7a68') }));
        awn.appendChild(el('rect', { x: sx - 2, y: sy, width: 40, height: 9, fill: 'none', stroke: '#3f3627' }));
        add(awn);
      }
      break;
    }
    case 'port-lane': { // 좁은 골목 양쪽 셋집
      roof(b.x, b.y, 28, b.h, '#75604a', '#5a4938');
      roof(b.x + 40, b.y, 28, b.h, '#6e5a46', '#544536');
      add(el('rect', { x: b.x + 29, y: b.y, width: 10, height: b.h + 14, fill: '#8f826a', opacity: 0.85 })); // 골목길
      door(b.x + 10, b.y + b.h); door(b.x + 50, b.y + b.h);
      winlight(b.x + 4, b.y + 12); winlight(b.x + 56, b.y + 20);
      break;
    }
    case 'fisher-hut': { // 판잣집 + 그물
      roof(b.x, b.y, b.w, b.h - 8, '#5f6672', '#454b55');
      for (let i = 1; i < 5; i++) add(el('line', { x1: b.x + i * (b.w / 5), y1: b.y + 2, x2: b.x + i * (b.w / 5), y2: b.y + b.h - 8, stroke: 'rgba(0,0,0,0.25)' }));
      door(b.x + b.w / 2 - 4, b.y + b.h - 8, 8, 5);
      winlight(b.x + 6, b.y + 8);
      add(el('circle', { cx: b.x + b.w + 8, cy: b.y + b.h - 4, r: 7, fill: 'none', stroke: '#8a7a5a', 'stroke-dasharray': '2 2' })); // 그물
      break;
    }
    case 'dock': { // 판자 부두 + 말뚝 + 등롱
      add(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: '#8a7350', stroke: '#5e4c33' }));
      for (let i = 1; i < 12; i++) add(el('line', { x1: b.x + i * (b.w / 12), y1: b.y + 1, x2: b.x + i * (b.w / 12), y2: b.y + b.h - 1, stroke: 'rgba(0,0,0,0.22)' }));
      add(el('rect', { x: b.x + 92, y: b.y + b.h, width: 34, height: 52, fill: '#8a7350', stroke: '#5e4c33' })); // 돌제
      for (let i = 0; i < 4; i++) add(el('line', { x1: b.x + 92, y1: b.y + b.h + 12 + i * 12, x2: b.x + 126, y2: b.y + b.h + 12 + i * 12, stroke: 'rgba(0,0,0,0.22)' }));
      for (const mx of [b.x + 6, b.x + b.w - 10, b.x + 96, b.x + 120]) add(el('circle', { cx: mx, cy: b.y + b.h - 5, r: 3.4, fill: '#4e3f2a', stroke: '#332916' }));
      add(el('path', { d: `M ${b.x + 24} ${b.y + b.h + 20} q 14 -9 30 0 q -3 9 -15 9 q -12 0 -15 -9 Z`, fill: '#6a5238', stroke: '#463521' })); // 예론의 배
      add(el('line', { x1: b.x + 39, y1: b.y + b.h + 12, x2: b.x + 39, y2: b.y + b.h + 22, stroke: '#463521', 'stroke-width': 2 }));
      break;
    }
    case 'saltfields': { // 증발지 격자
      add(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: '#93876b', rx: 3 }));
      for (let r = 0; r < 2; r++) for (let cIdx = 0; cIdx < 4; cIdx++)
        add(el('rect', { x: b.x + 6 + cIdx * 46, y: b.y + 6 + r * 38, width: 40, height: 32, fill: r + cIdx & 1 ? '#cfc7ad' : '#bdb499', stroke: '#8a7f63', 'stroke-width': 1.5 }));
      break;
    }
    case 'mudflat-huts': { // 작은 판자 움막 둘
      roof(b.x, b.y + 6, 36, 30, '#6b5c44', '#4e4232');
      roof(b.x + 40, b.y, 34, 28, '#75644a', '#584a36');
      for (let i = 1; i < 4; i++) {
        add(el('line', { x1: b.x + i * 9, y1: b.y + 8, x2: b.x + i * 9, y2: b.y + 34, stroke: 'rgba(0,0,0,0.2)' }));
        add(el('line', { x1: b.x + 40 + i * 8.5, y1: b.y + 2, x2: b.x + 40 + i * 8.5, y2: b.y + 26, stroke: 'rgba(0,0,0,0.2)' }));
      }
      door(b.x + 14, b.y + 36, 7, 5); door(b.x + 52, b.y + 28, 7, 5);
      break;
    }
  }
  const lbl = el('text', { x: b.x + b.w / 2, y: b.y - 7, class: 'bld-label' }, b.name);
  grp.appendChild(lbl);
  g.appendChild(grp);
}

/* ---------- 길·등불·바다 ---------- */
const PATHS = [
  'M 187 385 L 187 420 Q 187 440 220 440 L 280 440 Q 302 440 336 438',
  'M 336 438 L 336 464 L 336 476 Q 336 500 300 505 L 280 505',
  'M 372 357 L 372 400 Q 372 430 430 440',
  'M 500 470 L 500 505',
  'M 273 378 L 273 400 Q 273 430 336 438',
  'M 500 375 L 500 300 Q 500 260 560 240 Q 620 220 697 225',
  'M 697 225 Q 760 230 800 200 L 812 165',
  'M 697 260 Q 740 300 720 360 L 740 425',
  'M 570 440 Q 630 470 690 465',
  'M 336 438 Q 400 430 430 440',
  'M 107 462 Q 107 440 140 420 L 165 400',
];
function drawTerrain(g) {
  for (const d of PATHS)
    g.appendChild(el('path', { d, fill: 'none', stroke: '#9b8a68', 'stroke-width': 11, 'stroke-linecap': 'round', opacity: 0.55 }));
  // 등불 (밤에 점등)
  for (const [lx, ly] of [[350, 470], [430, 465], [186, 496], [396, 500], [660, 250]]) {
    g.appendChild(el('rect', { x: lx - 1.5, y: ly - 14, width: 3, height: 14, fill: '#4a3d2c' }));
    g.appendChild(el('circle', { cx: lx, cy: ly - 16, r: 3.6, class: 'lantern' }));
    g.appendChild(el('circle', { cx: lx, cy: ly - 16, r: 9, class: 'lantern-glow' }));
  }
}
function drawSea(g) {
  const sea = ZONES.find((z) => z.id === 'sea');
  g.appendChild(el('rect', { x: sea.x, y: sea.y, width: sea.w, height: sea.h, fill: sea.fill }));
  g.appendChild(el('rect', { x: sea.x, y: sea.y, width: sea.w, height: 6, fill: '#3d7492', opacity: 0.8 }));
  for (let i = 0; i < 3; i++) {
    let d = `M -80 ${545 + i * 26}`;
    for (let x = -80; x < 1100; x += 40) d += ` q 10 -5 20 0 q 10 5 20 0`;
    g.appendChild(el('path', { d, fill: 'none', stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 2, class: `wave wave-${i}` }));
  }
}

/* ---------- 날씨 연출 ---------- */
let weatherLayer = null;
function currentWeather() {
  const withW = [...LOG].reverse().find((e) => e.weather);
  if (withW) return withW.weather;
  // 구 이벤트 폴백: 키워드
  const recent = LOG.filter((e) => Date.now() - new Date(e.ts) < 6 * 3600000);
  const text = recent.map((e) => `${e.log_line} ${e.truth}`).join(' ');
  for (const [kw, label] of [['폭풍', '바람'], ['비가', '비'], ['빗', '비'], ['눈이', '눈'], ['안개', '안개'], ['바람', '바람'], ['구름', '흐림']])
    if (text.includes(kw)) return label;
  return '맑음';
}
function renderWeather() {
  const w = currentWeather();
  weatherLayer.innerHTML = '';
  const map = $('#map');
  map.classList.remove('w-fog', 'w-overcast');
  if (w === '비' || w === '눈') {
    const isSnow = w === '눈';
    for (let i = 0; i < (isSnow ? 34 : 44); i++) {
      const x = Math.random() * 1000, delay = Math.random() * 2;
      const n = isSnow
        ? el('circle', { cx: x, cy: -10, r: 1.8, class: 'flake', style: `animation-delay:${delay}s` })
        : el('line', { x1: x, y1: -14, x2: x - 4, y2: 0, class: 'raindrop', style: `animation-delay:${delay}s` });
      weatherLayer.appendChild(n);
    }
    if (!isSnow) weatherLayer.appendChild(el('rect', { x: 0, y: 0, width: 1000, height: 640, fill: '#22304a', opacity: 0.16, 'pointer-events': 'none' }));
  } else if (w === '안개') {
    map.classList.add('w-fog');
    weatherLayer.appendChild(el('rect', { x: 0, y: 0, width: 1000, height: 640, fill: '#cfd4d8', opacity: 0.3, 'pointer-events': 'none' }));
  } else if (w === '흐림') {
    map.classList.add('w-overcast');
    weatherLayer.appendChild(el('rect', { x: 0, y: 0, width: 1000, height: 640, fill: '#3a4048', opacity: 0.18, 'pointer-events': 'none' }));
  } else if (w === '바람') {
    for (let i = 0; i < 5; i++)
      weatherLayer.appendChild(el('path', { d: `M ${-160 - i * 60} ${80 + i * 110} q 30 -10 60 0 t 60 0 t 60 0`, class: 'wind-line', style: `animation-delay:${i * 1.1}s` }));
  }
  return w;
}

/* ================= 전역 상태 ================= */
let SNAP = null, LOG = [], ROUTINES = null;
let lastSeenTs = localStorage.getItem('mirhan-last-seen') ?? '1970-01-01';
let sessionDividerTs = null;
const actors = new Map();
const anonActors = new Map();
const playQueue = [];
let playing = null;
let mapLayers = {};

/* ---------- 상단 바 ---------- */
function villageDateLabel() {
  const c = SNAP.clock;
  const anchor = new Date(`${c.anchor_date}T00:00:00`);
  const days = Math.floor((Date.now() - anchor) / 86400000);
  return `기록력 1년 ${c.anchor_week + Math.floor(days / 7)}주 ${(days % 7) + 1}일`;
}
function renderTopbar() {
  if (!SNAP) return;
  $('#village-date').textContent = villageDateLabel();
  $('#real-time').textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  $('#weather').textContent = currentWeather();
  const r = SNAP.runner ?? {};
  const ne = $('#next-event');
  ne.classList.remove('generating', 'dead');
  if (!r.runner_alive) { ne.textContent = '러너 정지 — 사건이 일어나지 않는다'; ne.classList.add('dead'); }
  else if (r.generating) { ne.textContent = '사건이 일어나는 중… (~4분)'; ne.classList.add('generating'); }
  else if (r.next_event_at) {
    const t = new Date(r.next_event_at);
    ne.textContent = `다음 사건 ${t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}쯤`;
  } else ne.textContent = '러너 가동 중';
}

/* ---------- 밤낮 ---------- */
function isNightNow() { const h = new Date().getHours(); return h >= 20 || h < 6; }
function nightOverlayOpacity() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 22 || h < 5) return 0.55;
  if (h >= 20) return (h - 20) / 2 * 0.55;
  if (h < 6) return (1 - (h - 5)) * 0.55;
  if (h >= 18) return (h - 18) / 2 * 0.25;
  return 0;
}
function updateNight() {
  mapLayers.night.setAttribute('opacity', nightOverlayOpacity());
  document.body.classList.toggle('night', isNightNow());
  const h = new Date().getHours();
  document.body.classList.toggle('day', h >= 8 && h < 18); // 빨래는 낮에만
}

/* ---------- 지도 구축 ---------- */
function buildMap() {
  const svg = $('#map');
  svg.innerHTML = '';
  const zones = el('g'), terrain = el('g'), blds = el('g'), chars = el('g'), fx = el('g');
  for (const z of ZONES) {
    if (z.id === 'sea') continue;
    zones.appendChild(el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, fill: z.fill }));
  }
  // 언덕 단차 표현
  zones.appendChild(el('path', { d: 'M 620 0 L 620 300 L 640 300 Q 660 260 655 200 Q 650 120 668 60 L 668 0 Z', fill: 'rgba(0,0,0,0.12)' }));
  drawSea(zones);
  drawGroundDetail(zones);
  for (const z of ZONES) if (z.label) zones.appendChild(el('text', { x: z.lx, y: z.ly, class: 'zone-label' }, z.label));
  drawTerrain(terrain);
  drawProps(terrain);
  for (const b of BUILDINGS) drawBuilding(blds, b);
  const critterLayer = el('g');
  drawGulls(blds);
  weatherLayer = el('g', { 'pointer-events': 'none' });
  const night = el('rect', { x: 0, y: 0, width: 1000, height: 640, fill: '#0a1030', opacity: 0, 'pointer-events': 'none' });
  svg.append(zones, terrain, blds, critterLayer, chars, night, weatherLayer, fx);
  mapLayers = { zones, terrain, blds, critterLayer, chars, night, fx };
  spawnCritters();
}

/* ---------- 앰비언트 동물 (연출 전용 — 세계 데이터 아님) ---------- */
const critters = [];
function makeGoat() {
  const g = el('g');
  const tone = rng() < 0.5 ? '#d8d3c8' : '#b8a998';
  g.appendChild(el('ellipse', { cx: 0, cy: -4, rx: 6, ry: 3.6, fill: tone, stroke: 'rgba(0,0,0,0.25)' }));
  g.appendChild(el('line', { x1: -4, y1: -1, x2: -4, y2: 0.5, stroke: '#6b6155', 'stroke-width': 1.4 }));
  g.appendChild(el('line', { x1: 4, y1: -1, x2: 4, y2: 0.5, stroke: '#6b6155', 'stroke-width': 1.4 }));
  g.appendChild(el('circle', { cx: 6.5, cy: -6.5, r: 2.4, fill: tone, stroke: 'rgba(0,0,0,0.25)' }));
  g.appendChild(el('line', { x1: 7.5, y1: -8.5, x2: 9, y2: -10, stroke: '#8a7a5a', 'stroke-width': 1.2 }));
  return g;
}
function makeChicken() {
  const g = el('g');
  g.appendChild(el('ellipse', { cx: 0, cy: -2.5, rx: 3.4, ry: 2.6, fill: '#ece6d8', stroke: 'rgba(0,0,0,0.25)' }));
  g.appendChild(el('circle', { cx: 3, cy: -5, r: 1.7, fill: '#ece6d8' }));
  g.appendChild(el('circle', { cx: 3.4, cy: -6.4, r: 0.8, fill: '#c0392b' }));
  g.appendChild(el('path', { d: 'M 4.6 -5 l 1.6 0.5 l -1.6 0.7 Z', fill: '#d9a441' }));
  return g;
}
function spawnCritters() {
  critters.length = 0;
  const spawn = (maker, bounds, n, speed) => {
    for (let i = 0; i < n; i++) {
      const g = maker();
      mapLayers.critterLayer.appendChild(g);
      const x = bounds.x + 8 + rng() * (bounds.w - 16), y = bounds.y + 10 + rng() * (bounds.h - 12);
      critters.push({ g, x, y, tx: x, ty: y, bounds, speed, pauseUntil: 0, flip: false });
    }
  };
  spawn(makeGoat, PASTURE, 3, 7);
  spawn(makeChicken, GARDEN, 4, 9);
}
function critterTick() {
  for (const c of critters) {
    if (Date.now() < c.pauseUntil || Math.hypot(c.tx - c.x, c.ty - c.y) > 2) continue;
    if (Math.random() < 0.4) {
      c.tx = c.bounds.x + 8 + Math.random() * (c.bounds.w - 16);
      c.ty = c.bounds.y + 10 + Math.random() * (c.bounds.h - 12);
      c.flip = c.tx < c.x;
    }
    c.pauseUntil = Date.now() + 2500 + Math.random() * 8000;
  }
}

/* ---------- 앰비언트 루틴 ---------- */
function blockMatches(b) {
  if (!b.condition) return true;
  const m = b.condition.match(/^weather:(!?)(.+)$/);
  if (!m) return true;
  const [, neg, val] = m;
  const now = currentWeather();
  return neg ? now !== val : now === val;
}
function scheduleBlockFor(id, d = new Date()) {
  const r = ROUTINES.characters[id];
  if (!r) return null;
  const hm = d.getHours() * 60 + d.getMinutes();
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return r.schedule.find((b) => hm >= toMin(b.from) && hm < toMin(b.to) && blockMatches(b)) ?? null;
}
function homePlaceOf(id) {
  const c = SNAP.characters.find((x) => x.id === id);
  return c?.home?.place ?? ROUTINES.characters[id]?.home ?? 'market'; // 정본: characters.json
}

function makeActorSvg(spriteId, name, labelCls) {
  const sp = SPRITES[spriteId] ?? SPRITES._anon;
  const g = el('g', { cursor: 'pointer' });
  const img = el('image', {
    width: sp.w, height: sp.h, x: -sp.w / 2, y: -sp.h,
    href: sp.down[0], style: 'image-rendering: pixelated',
  });
  g.appendChild(img);
  g.appendChild(el('text', { y: 11, class: labelCls }, name));
  return { g, img, sp };
}
function ensureActors() {
  for (const c of SNAP.characters) {
    if (c.status !== 'alive') { if (actors.has(c.id)) { actors.get(c.id).g.remove(); actors.delete(c.id); } continue; }
    if (actors.has(c.id)) continue;
    const { g, img, sp } = makeActorSvg(c.id, c.name, 'char-label');
    g.addEventListener('click', () => showCharCard(c.id));
    mapLayers.chars.appendChild(g);
    const start = randIn(placeOf(homePlaceOf(c.id)));
    actors.set(c.id, { x: start.x, y: start.y, tx: start.x, ty: start.y, g, img, sp, dir: 'down', frame: 0, pauseUntil: 0, staged: false, phase: 'awake' });
  }
}

/* 취침: 문으로 걸어가 실내로 사라지고 지붕 위 💤. 기상: 문에서 나온다 (WO-013) */
const sleepMarks = new Map(); // actorId → svg text
function addSleepMark(id) {
  if (sleepMarks.has(id)) return;
  const b = placeOf(homePlaceOf(id));
  const idx = [...sleepMarks.values()].filter((m) => m.dataset.slug === b.slug).length;
  const t = el('text', { x: b.x + b.w / 2 - 8 + idx * 16, y: b.y + 14, class: 'sleep-mark' }, '💤');
  t.dataset.slug = b.slug;
  mapLayers.fx.appendChild(t);
  sleepMarks.set(id, t);
}
function removeSleepMark(id) { sleepMarks.get(id)?.remove(); sleepMarks.delete(id); }
function wakeActor(id, a) {
  removeSleepMark(id);
  const door = doorPoint(homePlaceOf(id));
  a.x = door.x; a.y = door.y; a.tx = door.x; a.ty = door.y + 8;
  a.g.style.display = '';
  a.phase = 'awake';
}
function routineTick() {
  if (!SNAP || !ROUTINES) return;
  for (const [id, a] of actors) {
    if (a.staged) continue;
    const block = scheduleBlockFor(id);
    if (!block) { // 취침 시간
      if (a.phase === 'inside') continue;
      const door = doorPoint(homePlaceOf(id));
      if (a.phase !== 'toDoor') { a.phase = 'toDoor'; a.tx = door.x; a.ty = door.y; }
      else if (Math.hypot(a.x - door.x, a.y - door.y) < 7) {
        a.phase = 'inside'; a.g.style.display = 'none'; addSleepMark(id);
      }
      continue;
    }
    if (a.phase === 'inside') wakeActor(id, a);
    a.phase = 'awake';
    const b = placeOf(block.place);
    const inPlace = a.tx >= b.x - 12 && a.tx <= b.x + b.w + 12 && a.ty >= b.y - 12 && a.ty <= b.y + b.h + 30;
    if (!inPlace) {
      const p = randIn(b); a.tx = p.x; a.ty = p.y;
    } else if (Date.now() > a.pauseUntil && Math.hypot(a.tx - a.x, a.ty - a.y) < 2) {
      if (Math.random() < 0.3) { const p = randIn(b); a.tx = p.x; a.ty = p.y; }
      a.pauseUntil = Date.now() + 3000 + Math.random() * 9000;
    }
  }
  critterTick();
}

/* ---------- 이동·스프라이트 애니메이션 (rAF 절제) ---------- */
let rafId = null, lastFrame = 0, lastSpriteSwap = 0;
function frame(t) {
  rafId = requestAnimationFrame(frame);
  if (t - lastFrame < 33) return; // ~30fps 상한
  const dt = Math.min(0.1, (t - lastFrame) / 1000); lastFrame = t;
  const swap = t - lastSpriteSwap > 180;
  if (swap) lastSpriteSwap = t;
  const SPEED = 42;
  const step = (a) => {
    const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
    const moving = dist > 1;
    if (moving) {
      const mv = Math.min(dist, (a.fast ? SPEED * 2.4 : SPEED) * dt);
      a.x += (dx / dist) * mv; a.y += (dy / dist) * mv;
      a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (swap) a.frame = a.frame === 1 ? 2 : 1;
    } else if (a.frame !== 0) a.frame = 0;
    if (swap || moving) a.img.setAttribute('href', a.sp[a.dir][a.frame]);
    a.g.setAttribute('transform', `translate(${a.x.toFixed(1)}, ${a.y.toFixed(1)})`);
  };
  for (const a of actors.values()) step(a);
  for (const a of anonActors.values()) step(a);
  for (const c of critters) {
    const dx = c.tx - c.x, dy = c.ty - c.y, dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const mv = Math.min(dist, c.speed * dt);
      c.x += (dx / dist) * mv; c.y += (dy / dist) * mv;
    }
    c.g.setAttribute('transform', `translate(${c.x.toFixed(1)}, ${c.y.toFixed(1)})${c.flip ? ' scale(-1,1)' : ''}`);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; document.body.classList.add('anim-paused'); }
  else { document.body.classList.remove('anim-paused'); if (!rafId) rafId = requestAnimationFrame(frame); }
});

/* ---------- 이벤트 재생 ---------- */
function actorFor(ref) {
  if (actors.has(ref)) return actors.get(ref);
  if (anonActors.has(ref)) return anonActors.get(ref);
  const { g, img, sp } = makeActorSvg('_anon', ref, 'anon-label');
  mapLayers.chars.appendChild(g);
  const start = { x: 500 + (Math.random() * 80 - 40), y: 480 };
  const a = { x: start.x, y: start.y, tx: start.x, ty: start.y, g, img, sp, dir: 'down', frame: 0, anon: true };
  anonActors.set(ref, a);
  return a;
}
function speechBubble(a, name, line) {
  const width = Math.min(300, Math.max(110, line.length * 11 + 20));
  const g = el('g', { class: 'speech' });
  const lines = [];
  let buf = '';
  for (const ch of line) { buf += ch; if (buf.length >= 24) { lines.push(buf); buf = ''; } }
  if (buf) lines.push(buf);
  const h = 26 + lines.length * 15;
  g.appendChild(el('rect', { x: -width / 2, y: -h - 18, width, height: h, class: 'speech-box', rx: 6 }));
  g.appendChild(el('text', { x: -width / 2 + 8, y: -h - 4, class: 'speech-name' }, name));
  lines.forEach((ln, i) => g.appendChild(el('text', { x: -width / 2 + 8, y: -h + 12 + i * 15, class: 'speech-text' }, ln)));
  mapLayers.fx.appendChild(g);
  const place = () => g.setAttribute('transform', `translate(${a.x}, ${a.y - a.sp.h - 2})`);
  const track = setInterval(place, 60);
  place();
  return () => { clearInterval(track); g.remove(); };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function playEvent(entry) {
  playing = entry;
  const banner = $('#playback-banner');
  banner.textContent = `사건 재생 — ${entry.log_line.slice(0, 40)}${entry.log_line.length > 40 ? '…' : ''}`;
  banner.classList.remove('hidden');
  try {
    for (const s of entry.staging ?? []) {
      const a = actorFor(s.actor);
      if (a.phase === 'inside') wakeActor(s.actor, a); // 사건이 잠을 깨운다
      a.staged = true; a.fast = true;
      const p = randIn(placeOf(s.move_to));
      a.tx = p.x; a.ty = p.y;
    }
    await wait(2600);
    for (const d of entry.dialogue ?? []) {
      const speakerChar = SNAP.characters.find((c) => c.id === d.speaker);
      const a = actorFor(d.speaker);
      const remove = speechBubble(a, speakerChar ? speakerChar.name : d.speaker, d.line);
      await wait(4000 + Math.min(2000, d.line.length * 35));
      remove();
    }
    if (!(entry.dialogue ?? []).length) await wait(2500);
  } finally {
    for (const a of actors.values()) { a.staged = false; a.fast = false; }
    for (const a of anonActors.values()) a.g.remove();
    anonActors.clear();
    banner.classList.add('hidden');
    playing = null;
    if (playQueue.length) playEvent(playQueue.shift());
  }
}
function enqueuePlayback(entry) {
  if (playing) playQueue.push(entry);
  else playEvent(entry);
}

/* ---------- 마을 로그 패널 ---------- */
function renderLog() {
  const list = $('#log-list');
  list.innerHTML = '';
  const sorted = [...LOG].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  let dividerDone = false;
  for (const e of sorted) {
    if (!dividerDone && sessionDividerTs && e.ts <= sessionDividerTs) {
      if (sorted.indexOf(e) > 0) list.appendChild(div('new-divider', '여기까지 새 소식'));
      dividerDone = true;
    }
    const item = div('log-item');
    const t = new Date(e.ts);
    item.appendChild(div('meta',
      `<span class="grade-badge g${e.grade}">등급 ${e.grade}</span>` +
      `<span>${t.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>` +
      `<span>${e.week}주</span>${e.weather ? `<span>${esc(e.weather)}</span>` : ''}`));
    item.appendChild(div('', esc(e.log_line)));
    item.addEventListener('click', () => showEventDetail(e));
    list.appendChild(item);
  }
  if (!sorted.length) list.appendChild(div('placeholder', '아직 기록된 사건이 없다.'));
}

/* ---------- 이벤트 상세 모달 ---------- */
function openModal(html) { $('#modal').innerHTML = html; $('#modal-backdrop').classList.remove('hidden'); }
function closeModal() { $('#modal-backdrop').classList.add('hidden'); }
$('#modal-backdrop').addEventListener('click', (ev) => { if (ev.target.id === 'modal-backdrop') closeModal(); });

function showEventDetail(e) {
  const t = new Date(e.ts);
  const dlg = (e.dialogue ?? []).map((d) => {
    const c = SNAP.characters.find((x) => x.id === d.speaker);
    return `<div class="dlg-line"><span class="who">${esc(c ? c.name : d.speaker)}</span>${esc(d.line)}</div>`;
  }).join('') || '<div class="small-muted">대화 없음</div>';
  const affected = (e.affected ?? []).map((id) => {
    const c = SNAP.characters.find((x) => x.id === id);
    return `<span class="chip" data-char="${esc(id)}">${esc(c ? c.name : id)}</span>`;
  }).join('');
  openModal(`
    <h3>${esc(e.log_line)}</h3>
    <div class="meta"><span class="grade-badge g${e.grade}">등급 ${e.grade}</span>
      <span>${t.toLocaleString('ko-KR', { hour12: false })}</span><span>${e.week}주</span>
      ${e.weather ? `<span>날씨 ${esc(e.weather)}</span>` : ''}<span>${esc(e.id)}</span></div>
    <div class="tp-grid">
      <div class="tp-cell"><h4><span class="truth-badge">TRUTH</span> 실제로 일어난 일</h4>${esc(e.truth)}</div>
      <div class="tp-cell"><h4>마을이 아는 것</h4>${esc(e.public_knowledge)}</div>
    </div>
    <h4 class="small-muted" style="margin-bottom:4px">대화</h4>${dlg}
    <h4 class="small-muted" style="margin:10px 0 4px">관련 인물·장소</h4><div>${affected || '<span class="small-muted">—</span>'}</div>
    <div class="small-muted" style="margin-top:8px">상태 변화: ${esc(e.state_diff_summary ?? '없음')}</div>
    <div class="modal-actions">
      <button class="primary" id="replay-btn">이 사건 다시 재생</button>
      <button id="close-btn">닫기</button>
    </div>`);
  $('#replay-btn').addEventListener('click', () => { closeModal(); enqueuePlayback(e); });
  $('#close-btn').addEventListener('click', closeModal);
  $('#modal').querySelectorAll('[data-char]').forEach((chip) =>
    chip.addEventListener('click', () => { closeModal(); showCharCard(chip.dataset.char); }));
}

/* ---------- 인물 카드 ---------- */
function renderCharStrip() {
  const strip = $('#char-strip');
  strip.innerHTML = '';
  for (const c of SNAP.characters) {
    const chip = div(`char-chip${c.status !== 'alive' ? ' dead' : ''}`);
    const sp = SPRITES[c.id];
    chip.innerHTML = sp
      ? `<img src="${sp.down[0]}" width="12" height="16" style="image-rendering:pixelated">${esc(c.name)}`
      : esc(c.name);
    chip.addEventListener('click', () => showCharCard(c.id));
    strip.appendChild(chip);
  }
}
function appearancesOf(id) {
  return LOG.filter((e) =>
    (e.affected ?? []).includes(id) ||
    (e.dialogue ?? []).some((d) => d.speaker === id) ||
    (e.staging ?? []).some((s) => s.actor === id)
  ).sort((a, b) => new Date(b.ts) - new Date(a.ts));
}
function showCharCard(id) {
  const c = SNAP.characters.find((x) => x.id === id);
  if (!c) return;
  const card = $('#char-card');
  const district = SNAP.places.districts.find((d) => d.id === c.district)?.name ?? c.district;
  const rels = Object.entries(c.relationships ?? {}).map(([rid, r]) => {
    const other = SNAP.characters.find((x) => x.id === rid);
    return `<li><span class="rel-type">→ ${esc(r.type)}</span><b class="rel-target" data-char="${esc(rid)}" style="cursor:pointer">${esc(other ? other.name : rid)}</b>
      <span class="rel-tension">텐션 ${r.tension ?? 0}</span><br><span class="small-muted">${esc(r.note ?? '')}</span></li>`;
  }).join('');
  const incoming = SNAP.characters.filter((o) => o.id !== id && o.relationships?.[id])
    .map((o) => {
      const r = o.relationships[id];
      return `<li><span class="rel-type">← ${esc(r.type)}</span><b class="rel-target" data-char="${esc(o.id)}" style="cursor:pointer">${esc(o.name)}</b>
        <span class="rel-tension">텐션 ${r.tension ?? 0}</span><br><span class="small-muted">${esc(r.note ?? '')}</span></li>`;
    }).join('');
  const scars = (c.scars ?? []).map((s) =>
    `<li><span class="small-muted">${s.cycle != null ? `${s.cycle}주` : '옛일'} · ${esc(s.event_id)}</span><br>${esc(s.mark)}</li>`).join('');
  const quirks = (c.quirks ?? []).map((q) => `<li>${esc(q)}</li>`).join('');
  const appear = appearancesOf(id).map((e) =>
    `<li class="appear-item" data-evt="${esc(e.id)}"><span class="small-muted">${new Date(e.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span> ${esc(e.log_line)}</li>`).join('');
  const timelineAppear = (SNAP.timeline ?? []).filter((t) => (t.affected ?? []).includes(id))
    .map((t) => `<li><span class="small-muted">${t.cycle}주 · ${esc(t.id)}</span> ${esc(t.public_knowledge ?? '')}</li>`).join('');
  const sp = SPRITES[id];
  card.innerHTML = `
    <div class="card-head">${sp ? `<img src="${sp.down[0]}" width="36" height="48" style="image-rendering:pixelated">` : ''}
      <div><div class="card-name">${esc(c.name)} ${c.status !== 'alive' ? `<span class="status-badge">${esc(c.status)}</span>` : ''}</div>
      <div class="card-role">${esc(c.role)} · ${esc(district)}${c.origin_district ? ` (출신: ${esc(SNAP.places.districts.find((d) => d.id === c.origin_district)?.name ?? c.origin_district)})` : ''}</div>
      ${c.home ? `<div class="small-muted">집: ${esc(c.home.desc)}</div>` : ''}</div></div>
    <div class="small-muted">텐션 ${c.tension}</div>
    <div class="tension-bar"><div style="width:${Math.min(100, c.tension)}%"></div></div>
    <div class="card-sec"><h3><span class="truth-badge">TRUTH</span> 비밀</h3><div>${esc(c.secret ?? '—')}</div></div>
    <div class="card-sec"><h3>욕망 <span class="truth-badge">TRUTH</span></h3>
      <ul><li><span class="small-muted">겉으로:</span> ${esc(c.desires?.surface ?? '—')}</li>
      <li><span class="small-muted">속으로:</span> ${esc(c.desires?.hidden ?? '—')}</li></ul></div>
    <div class="card-sec"><h3>소원 <span class="status-badge ${esc(c.wish?.status)}">${esc(c.wish?.status ?? '—')}</span></h3>
      <div>${esc(c.wish?.text ?? '—')}</div>${c.wish?.note ? `<div class="small-muted">${esc(c.wish.note)}</div>` : ''}</div>
    <div class="card-sec"><h3>버릇</h3><ul>${quirks || '<li class="small-muted">—</li>'}</ul></div>
    <div class="card-sec"><h3>흉터 (${(c.scars ?? []).length})</h3><ul>${scars || '<li class="small-muted">아직 없다</li>'}</ul></div>
    <div class="card-sec"><h3>관계</h3><ul>${rels || '<li class="small-muted">—</li>'}${incoming}</ul></div>
    <div class="card-sec"><h3>등장 이벤트</h3><ul>${appear || '<li class="small-muted">실시간 전환 후 아직 없음</li>'}</ul></div>
    <div class="card-sec"><h3>연대기 등장 (주간 truth)</h3><ul>${timelineAppear || '<li class="small-muted">—</li>'}</ul></div>`;
  card.querySelectorAll('[data-char]').forEach((n) => n.addEventListener('click', () => showCharCard(n.dataset.char)));
  card.querySelectorAll('[data-evt]').forEach((n) => n.addEventListener('click', () => {
    const e = LOG.find((x) => x.id === n.dataset.evt);
    if (e) showEventDetail(e);
  }));
  card.scrollTop = 0;
}

/* ---------- 신탁 패널 ---------- */
$('#oracle-toggle').addEventListener('click', () => $('#oracle-pane').classList.toggle('collapsed'));
function renderOracles() {
  const h = $('#oracle-history');
  h.innerHTML = '';
  for (const o of [...(SNAP.oracles ?? [])].reverse()) {
    h.appendChild(div('oracle-item',
      `<div class="meta">${esc(o.id)} · ${o.cycle != null ? `${o.cycle}주` : '미처리'} · ${o.proclaimed ? '공표됨' : '비공표'}</div>${esc(o.decree)}`));
  }
  if (!(SNAP.oracles ?? []).length) h.appendChild(div('small-muted', '아직 신탁이 없다.'));
}
$('#oracle-send').addEventListener('click', async () => {
  const decree = $('#oracle-text').value.trim();
  if (!decree) { $('#oracle-status').textContent = '신탁의 말이 비어 있다.'; return; }
  if (!confirm(`이 신탁을 내린다:\n\n"${decree}"\n\n공표: ${$('#oracle-proclaimed').checked ? '예' : '아니오'}\n\n신탁은 비가역이다 — 러너가 다음 이벤트에서 집어간다.`)) return;
  $('#oracle-status').textContent = '기록 중…';
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decree, proclaimed: $('#oracle-proclaimed').checked }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? res.status);
    $('#oracle-status').textContent = `${body.id} 기록됨 — 다음 이벤트에서 세계에 닿는다.`;
    $('#oracle-text').value = '';
  } catch (e) { $('#oracle-status').textContent = `실패: ${e.message}`; }
});

/* ---------- 데이터 로드·갱신 ---------- */
async function fetchAll(initial = false) {
  const [snap, logEntries] = await Promise.all([
    fetch('/api/snapshot').then((r) => r.json()),
    fetch('/api/log').then((r) => r.json()),
  ]);
  const prevCount = LOG.length;
  SNAP = snap; LOG = logEntries;
  if (initial) {
    sessionDividerTs = lastSeenTs;
    localStorage.setItem('mirhan-last-seen', LOG.reduce((m, e) => (e.ts > m ? e.ts : m), lastSeenTs));
  } else if (LOG.length > prevCount) {
    const fresh = [...LOG].sort((a, b) => new Date(a.ts) - new Date(b.ts)).slice(prevCount);
    for (const e of fresh) enqueuePlayback(e);
    localStorage.setItem('mirhan-last-seen', LOG.reduce((m, e) => (e.ts > m ? e.ts : m), lastSeenTs));
  }
  ensureActors();
  renderLog(); renderOracles(); renderCharStrip(); renderTopbar(); renderWeather();
}
function connectStream() {
  const es = new EventSource('/api/stream');
  es.addEventListener('update', () => fetchAll(false).catch(() => {}));
}

/* ---------- 소리 연동 (WO-013) ---------- */
function rohanHammering() {
  const b = scheduleBlockFor('rohan-the-smith');
  return !!b && b.place === 'smithy' && /화덕|벼리|작업/.test(b.activity ?? '');
}
function setupAudio() {
  const muteBtn = $('#mute-btn'), vol = $('#vol-slider');
  vol.value = AudioEngine.volume;
  const paint = () => { muteBtn.textContent = AudioEngine.muted ? '🔇' : '🔊'; };
  paint();
  muteBtn.addEventListener('click', () => { AudioEngine.setMuted(!AudioEngine.muted); paint(); });
  vol.addEventListener('input', () => AudioEngine.setVolume(Number(vol.value)));
  document.addEventListener('pointerdown', () => AudioEngine.start(), { once: true });
  setInterval(() => AudioEngine.update({ night: isNightNow(), weather: currentWeather(), hammer: rohanHammering() }), 2000);
}

/* ---------- 부팅 ---------- */
(async function boot() {
  buildSprites();
  ROUTINES = await fetch('routines.json').then((r) => r.json());
  buildMap();
  await fetchAll(true);
  connectStream();
  updateNight();
  routineTick();
  setupAudio();
  setInterval(renderTopbar, 1000);
  setInterval(updateNight, 30000);
  setInterval(routineTick, 2000);
  setInterval(() => { if (!document.hidden) renderWeather(); }, 60000);
  setInterval(() => fetchAll(false).catch(() => {}), 30000);
  rafId = requestAnimationFrame(frame);
})();
