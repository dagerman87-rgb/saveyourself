/* 미르한 어항 뷰어 v1 (WO-011)
 * - 신의 창: truth 전면 표시 (공개 사이트와 완전 별개)
 * - 앰비언트 루틴: routines.json 일과표 + 배회 (AI 없음)
 * - 이벤트 재생: log.jsonl 새 항목 → staging 이동 → dialogue 말풍선 → 루틴 복귀
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

/* ---------- 지도 정의 (v1: 단색 면 + rect + 라벨) ---------- */
const ZONES = [
  { id: 'sea', x: 0, y: 520, w: 1000, h: 120, day: '#274b63', night: '#152736', label: null },
  { id: 'port', x: 0, y: 200, w: 620, h: 320, day: '#5d5546', night: '#2c2a24', label: '항구 구역', lx: 60, ly: 240 },
  { id: 'hill', x: 620, y: 0, w: 380, h: 300, day: '#6a6353', night: '#312e28', label: '언덕 구역', lx: 800, ly: 40 },
  { id: 'mudflat', x: 620, y: 300, w: 380, h: 220, day: '#75674f', night: '#332d24', label: '갯벌 구역', lx: 800, ly: 335 },
  { id: 'fields', x: 0, y: 0, w: 620, h: 200, day: '#4f5a40', night: '#252a20', label: null },
];
const BUILDINGS = [
  { slug: 'temple', name: '신전', x: 750, y: 80, w: 130, h: 85, color: '#b8a988' },
  { slug: 'oldtown', name: '구시가', x: 650, y: 195, w: 100, h: 65, color: '#9a8f7a' },
  { slug: 'smithy', name: '대장간', x: 140, y: 315, w: 95, h: 70, color: '#7d6a5c' },
  { slug: 'apple-yard', name: '사과나무 마당', x: 250, y: 330, w: 45, h: 45, color: '#5e7a4a', round: true },
  { slug: 'bakery', name: '빵집', x: 330, y: 295, w: 85, h: 62, color: '#a58a5f' },
  { slug: 'market', name: '시장', x: 430, y: 375, w: 140, h: 95, color: '#8f7f63' },
  { slug: 'port-lane', name: '항구 골목', x: 305, y: 415, w: 65, h: 48, color: '#6e675c' },
  { slug: 'fisher-hut', name: '예론의 오두막', x: 80, y: 465, w: 55, h: 42, color: '#6a7280' },
  { slug: 'dock', name: '부두', x: 160, y: 505, w: 240, h: 45, color: '#5a4f42' },
  { slug: 'saltfields', name: '소금밭', x: 690, y: 425, w: 190, h: 80, color: '#a89f86' },
  { slug: 'mudflat-huts', name: '갯벌 움막', x: 890, y: 355, w: 75, h: 55, color: '#6f6350' },
];
const PLACE_ALIAS = { // 러너 staging 슬러그 → 지도 슬러그 안전 매핑
  bakery: 'bakery', dock: 'dock', market: 'market', smithy: 'smithy', temple: 'temple',
  saltfields: 'saltfields', oldtown: 'oldtown', 'port-lane': 'port-lane',
  'fisher-hut': 'fisher-hut', 'mudflat-huts': 'mudflat-huts', 'apple-yard': 'apple-yard',
  harbor: 'dock', pier: 'dock', mudflat: 'saltfields', hill: 'temple', street: 'port-lane',
};
const placeOf = (slug) => BUILDINGS.find((b) => b.slug === (PLACE_ALIAS[slug] ?? slug)) ?? BUILDINGS.find((b) => b.slug === 'market');
const placeCenter = (slug) => { const b = placeOf(slug); return { x: b.x + b.w / 2, y: b.y + b.h + 12 }; };
const randIn = (b) => ({ x: b.x + 8 + Math.random() * (b.w - 16), y: b.y + b.h + 8 + Math.random() * 18 });

/* ---------- 전역 상태 ---------- */
let SNAP = null;          // /api/snapshot
let LOG = [];             // /api/log
let ROUTINES = null;      // routines.json
let lastSeenTs = localStorage.getItem('mirhan-last-seen') ?? '1970-01-01';
let sessionDividerTs = null; // 이번 세션에 표시할 구분선 기준
const actors = new Map(); // 인물 id → {x, y, tx, ty, g(svg), state, pauseUntil}
const anonActors = new Map();
const playQueue = [];
let playing = null;

/* ---------- 시계·상단 바 ---------- */
function villageDateLabel() {
  const c = SNAP.clock;
  const anchor = new Date(`${c.anchor_date}T00:00:00`);
  const days = Math.floor((Date.now() - anchor) / 86400000);
  const week = c.anchor_week + Math.floor(days / 7);
  const day = (days % 7) + 1;
  return `기록력 1년 ${week}주 ${day}일`;
}
function detectWeather() {
  const recent = LOG.filter((e) => Date.now() - new Date(e.ts) < 6 * 3600000);
  const text = recent.map((e) => `${e.log_line} ${e.truth}`).join(' ');
  for (const [kw, label] of [['폭풍', '폭풍'], ['비가', '비'], ['빗', '비'], ['눈이', '눈'], ['안개', '안개'], ['바람이 거세', '강풍'], ['구름', '흐림']])
    if (text.includes(kw)) return label;
  return '맑음';
}
function renderTopbar() {
  if (!SNAP) return;
  $('#village-date').textContent = villageDateLabel();
  $('#real-time').textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  $('#weather').textContent = detectWeather();
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
  if (h >= 20) return (h - 20) / 2 * 0.55;         // 해질녘
  if (h < 6) return (1 - (h - 5)) * 0.55;          // 동틀녘
  if (h >= 18) return (h - 18) / 2 * 0.25;
  return 0;
}

/* ---------- 지도 렌더 ---------- */
let mapLayers = {};
function buildMap() {
  const svg = $('#map');
  svg.innerHTML = '';
  const zones = el('g'); const blds = el('g'); const chars = el('g'); const fx = el('g');
  for (const z of ZONES) {
    zones.appendChild(el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, fill: z.day, 'data-zone': z.id }));
    if (z.label) zones.appendChild(el('text', { x: z.lx, y: z.ly, class: 'zone-label' }, z.label));
  }
  for (const b of BUILDINGS) {
    if (b.round) blds.appendChild(el('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: b.w / 2, fill: b.color, class: 'bld' }));
    else blds.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: b.color, class: 'bld', rx: 3 }));
    // 밤 창불
    if (!b.round) blds.appendChild(el('rect', { x: b.x + b.w * 0.25, y: b.y + b.h * 0.3, width: 8, height: 8, class: 'window-light' }));
    blds.appendChild(el('text', { x: b.x + b.w / 2, y: b.y - 4, class: 'bld-label' }, b.name));
  }
  const night = el('rect', { x: 0, y: 0, width: 1000, height: 640, fill: '#0a1030', opacity: 0, 'pointer-events': 'none' });
  svg.append(zones, blds, chars, night, fx);
  mapLayers = { zones, blds, chars, night, fx };
}
function updateNight() {
  mapLayers.night.setAttribute('opacity', nightOverlayOpacity());
  document.body.classList.toggle('night', isNightNow());
}

/* ---------- 앰비언트 루틴 ---------- */
function scheduleBlockFor(id, d = new Date()) {
  const r = ROUTINES.characters[id];
  if (!r) return null;
  const hm = d.getHours() * 60 + d.getMinutes();
  const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return r.schedule.find((b) => hm >= toMin(b.from) && hm < toMin(b.to)) ?? null;
}
function ensureActors() {
  for (const c of SNAP.characters) {
    const onMap = c.status === 'alive';
    if (!onMap) { if (actors.has(c.id)) { actors.get(c.id).g.remove(); actors.delete(c.id); } continue; }
    if (actors.has(c.id)) continue;
    const r = ROUTINES.characters[c.id] ?? { color: '#999', home: 'market' };
    const start = placeCenter(r.home);
    const g = el('g', { cursor: 'pointer' });
    g.appendChild(el('circle', { r: 9, fill: r.color, class: 'char-dot' }));
    g.appendChild(el('text', { y: 22, class: 'char-label' }, c.name));
    const sleep = el('text', { y: -14, class: 'sleep-mark' }, '💤'); sleep.style.display = 'none';
    g.appendChild(sleep);
    g.addEventListener('click', () => showCharCard(c.id));
    mapLayers.chars.appendChild(g);
    actors.set(c.id, { x: start.x, y: start.y, tx: start.x, ty: start.y, g, sleepEl: sleep, pauseUntil: 0, staged: false });
  }
}
function routineTick() {
  if (!SNAP || !ROUTINES) return;
  for (const [id, a] of actors) {
    if (a.staged) continue; // 이벤트 재생이 점유 중
    const block = scheduleBlockFor(id);
    const r = ROUTINES.characters[id];
    const asleep = !block;
    a.sleepEl.style.display = asleep ? '' : 'none';
    a.g.style.opacity = asleep ? 0.55 : 1;
    const targetPlace = block ? block.place : (r?.home ?? 'market');
    const b = placeOf(targetPlace);
    const inPlace = a.tx >= b.x - 10 && a.tx <= b.x + b.w + 10 && a.ty >= b.y - 10 && a.ty <= b.y + b.h + 30;
    if (!inPlace) {
      const p = randIn(b); a.tx = p.x; a.ty = p.y;
    } else if (!asleep && Date.now() > a.pauseUntil && Math.hypot(a.tx - a.x, a.ty - a.y) < 2) {
      // 배회: 도착해 있으면 가끔 근처로 이동하거나 멈춰 있는다
      if (Math.random() < 0.3) { const p = randIn(b); a.tx = p.x; a.ty = p.y; }
      a.pauseUntil = Date.now() + 3000 + Math.random() * 9000;
    }
  }
}

/* ---------- 이동 애니메이션 ---------- */
let lastFrame = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000); lastFrame = t;
  const SPEED = 42; // px/s
  const step = (a) => {
    const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const mv = Math.min(dist, (a.fast ? SPEED * 2.2 : SPEED) * dt);
      a.x += (dx / dist) * mv; a.y += (dy / dist) * mv;
    }
    a.g.setAttribute('transform', `translate(${a.x.toFixed(1)}, ${a.y.toFixed(1)})`);
  };
  for (const a of actors.values()) step(a);
  for (const a of anonActors.values()) step(a);
  requestAnimationFrame(frame);
}

/* ---------- 이벤트 재생 ---------- */
function actorFor(ref) {
  if (actors.has(ref)) return actors.get(ref);
  if (anonActors.has(ref)) return anonActors.get(ref);
  // 무명 배우: 회색 소형 원 + 역할 라벨
  const g = el('g');
  g.appendChild(el('circle', { r: 6, fill: '#8a8f99', class: 'anon-dot' }));
  g.appendChild(el('text', { y: 17, class: 'anon-label' }, ref));
  mapLayers.chars.appendChild(g);
  const start = { x: 500 + (Math.random() * 80 - 40), y: 480 };
  const a = { x: start.x, y: start.y, tx: start.x, ty: start.y, g, anon: true };
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
  const rect = el('rect', { x: -width / 2, y: -h - 18, width, height: h, class: 'speech-box', rx: 6 });
  g.appendChild(rect);
  g.appendChild(el('text', { x: -width / 2 + 8, y: -h - 4, class: 'speech-name' }, name));
  lines.forEach((ln, i) => g.appendChild(el('text', { x: -width / 2 + 8, y: -h + 12 + i * 15, class: 'speech-text' }, ln)));
  mapLayers.fx.appendChild(g);
  const track = setInterval(() => g.setAttribute('transform', `translate(${a.x}, ${a.y - 6})`), 60);
  g.setAttribute('transform', `translate(${a.x}, ${a.y - 6})`);
  return () => { clearInterval(track); g.remove(); };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function playEvent(entry) {
  playing = entry;
  const banner = $('#playback-banner');
  banner.textContent = `사건 재생 — ${entry.log_line.slice(0, 40)}${entry.log_line.length > 40 ? '…' : ''}`;
  banner.classList.remove('hidden');
  try {
    // 1) staging 순서대로 배우 이동
    for (const s of entry.staging ?? []) {
      const a = actorFor(s.actor);
      a.staged = true; a.fast = true;
      const p = randIn(placeOf(s.move_to));
      a.tx = p.x; a.ty = p.y;
    }
    await wait(2600);
    // 2) dialogue 말풍선 순차 (발화당 4~6초)
    for (const d of entry.dialogue ?? []) {
      const speakerChar = SNAP.characters.find((c) => c.id === d.speaker);
      const a = actorFor(d.speaker);
      const name = speakerChar ? speakerChar.name : d.speaker;
      const remove = speechBubble(a, name, d.line);
      await wait(4000 + Math.min(2000, d.line.length * 35));
      remove();
    }
    if (!(entry.dialogue ?? []).length) await wait(2500);
  } finally {
    // 3) 루틴 복귀
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
      `<span>${e.week}주</span>`));
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
      <span>${t.toLocaleString('ko-KR', { hour12: false })}</span><span>${e.week}주</span><span>${esc(e.id)}</span></div>
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
    const color = ROUTINES?.characters[c.id]?.color ?? '#999';
    chip.innerHTML = `<span class="swatch" style="background:${color}"></span>${esc(c.name)}`;
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
  card.innerHTML = `
    <div class="card-name">${esc(c.name)} ${c.status !== 'alive' ? `<span class="status-badge">${esc(c.status)}</span>` : ''}</div>
    <div class="card-role">${esc(c.role)} · ${esc(district)}${c.origin_district ? ` (출신: ${esc(SNAP.places.districts.find((d) => d.id === c.origin_district)?.name ?? c.origin_district)})` : ''}</div>
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
    const newest = LOG.reduce((m, e) => (e.ts > m ? e.ts : m), lastSeenTs);
    localStorage.setItem('mirhan-last-seen', newest);
  } else if (LOG.length > prevCount) {
    const fresh = [...LOG].sort((a, b) => new Date(a.ts) - new Date(b.ts)).slice(prevCount);
    for (const e of fresh) enqueuePlayback(e);
    localStorage.setItem('mirhan-last-seen', LOG.reduce((m, e) => (e.ts > m ? e.ts : m), lastSeenTs));
  }
  ensureActors();
  renderLog(); renderOracles(); renderCharStrip(); renderTopbar();
}

function connectStream() {
  const es = new EventSource('/api/stream');
  es.addEventListener('update', () => fetchAll(false).catch(() => {}));
  es.onerror = () => { /* retry는 브라우저가 알아서 */ };
}

/* ---------- 부팅 ---------- */
(async function boot() {
  ROUTINES = await fetch('routines.json').then((r) => r.json());
  buildMap();
  await fetchAll(true);
  connectStream();
  updateNight();
  routineTick();
  setInterval(renderTopbar, 1000);
  setInterval(updateNight, 30000);
  setInterval(routineTick, 2000);
  setInterval(() => fetchAll(false).catch(() => {}), 30000); // SSE 유실 대비 폴링
  requestAnimationFrame(frame);
})();
