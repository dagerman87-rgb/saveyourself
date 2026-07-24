#!/usr/bin/env node
// 어항 뷰어 서버 (WO-011): 신의 창 — truth·텐션·비밀 전부 서빙한다.
// 공개 사이트 파이프라인과 완전 별개. 이 서버의 출력을 배포·공개 경로에 연결하지 말 것.
// 기본은 localhost 전용. --host lan|0.0.0.0 으로 외부에 열 때는 토큰이 강제된다.
// 사용: node engine/viewer-server.mjs [--port 4400] [--host lan]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { ROOT } from './verify-world.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const PORT = Number(arg('--port') ?? process.env.VIEWER_PORT ?? 4400);
const HOST_ARG = arg('--host') ?? process.env.VIEWER_HOST ?? 'localhost';
const BIND = ['lan', 'all', '0.0.0.0'].includes(HOST_ARG) ? '0.0.0.0' : '127.0.0.1';
const EXPOSED = BIND === '0.0.0.0';
const VIEWER_DIR = path.join(ROOT, 'viewer');
const RUNNER_STATE = path.join(ROOT, 'engine', 'runner-state.json');
const RUNNER_LOCK = path.join(ROOT, 'engine', '.runner.lock');
const TOKEN_FILE = path.join(ROOT, 'engine', '.viewer-token');

// ---------- 접근 토큰 (외부 노출 시 강제) ----------
function loadToken() {
  try { const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); if (t) return t; } catch { /* 없으면 생성 */ }
  const t = crypto.randomBytes(18).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, t + '\n', 'utf8');
  return t;
}
const TOKEN = loadToken();
// 프록시·터널 경유 요청은 소켓 주소가 127.0.0.1로 보인다 — 로컬로 오인하면 안 된다.
const viaProxy = (req) => Boolean(
  req.headers['cf-connecting-ip'] || req.headers['cf-ray'] ||
  req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['forwarded']
);
const isLocal = (req) => {
  if (viaProxy(req)) return false;
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
};
function authorized(req, url) {
  if (isLocal(req)) return true;                         // 진짜 로컬만 토큰 불요
  if (url.searchParams.get('t') === TOKEN) return true;  // ?t=토큰
  return (req.headers.cookie ?? '').split(';').some((c) => c.trim() === `mirhan_t=${TOKEN}`);
}
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const log = (msg) => console.log(`[viewer ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}] ${msg}`);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.md': 'text/markdown; charset=utf-8',
};

function readLogEntries() {
  return read('world/log.jsonl').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function runnerState() {
  let state = null;
  try { state = JSON.parse(fs.readFileSync(RUNNER_STATE, 'utf8')); } catch { /* 없으면 null */ }
  let alive = false;
  try {
    const pid = Number(fs.readFileSync(RUNNER_LOCK, 'utf8').trim());
    process.kill(pid, 0);
    alive = true;
  } catch { alive = false; }
  return { ...(state ?? {}), runner_alive: alive };
}

function snapshot() {
  return {
    clock: readJson('world/clock.json'),
    characters: readJson('world/characters.json'),
    places: readJson('world/places.json'),
    factions: readJson('world/factions.json'),
    axes: readJson('world/axes.json'),
    timeline: readJson('world/timeline.json'),
    oracles: readJson('world/oracles.json'),
    upcoming: fs.existsSync(path.join(ROOT, 'world/upcoming.json')) ? readJson('world/upcoming.json') : [],
    runner: runnerState(),
    server_now: new Date().toISOString(),
  };
}

// ---------- 신탁 append (기존 파이프라인 그대로 — 러너가 다음 이벤트에서 집어간다) ----------
function appendOracle(decree, proclaimed) {
  const file = path.join(ROOT, 'world', 'oracles.json');
  const oracles = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nextNum = oracles.reduce((m, o) => {
    const n = Number(o.id?.match(/^oracle-(\d+)$/)?.[1] ?? 0);
    return Math.max(m, n);
  }, 0) + 1;
  const entry = {
    id: `oracle-${String(nextNum).padStart(3, '0')}`,
    cycle: null,
    decree: String(decree).trim(),
    proclaimed: Boolean(proclaimed),
    source: 'operator',
    ts: new Date().toISOString(),
  };
  oracles.push(entry);
  fs.writeFileSync(file, JSON.stringify(oracles, null, 2) + '\n', 'utf8');
  return entry;
}

// ---------- SSE: 파일 변경 통지 ----------
const sseClients = new Set();
function broadcast(type) {
  const payload = `event: update\ndata: ${JSON.stringify({ type, ts: Date.now() })}\n\n`;
  for (const res of sseClients) res.write(payload);
}
const WATCH = [
  ['world/log.jsonl', 'log'],
  ['world/oracles.json', 'oracles'],
  ['world/characters.json', 'world'],
  ['world/upcoming.json', 'upcoming'],
  ['engine/runner-state.json', 'runner'],
];
for (const [rel, type] of WATCH) {
  fs.watchFile(path.join(ROOT, rel), { interval: 2000 }, () => broadcast(type));
}

// ---------- HTTP ----------
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (!authorized(req, url)) {
      log(`거부: ${req.socket.remoteAddress} → ${url.pathname} (토큰 없음)`);
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>미르한 — 신의 창</h1><p>이 창은 운영자 전용이다. 접근 링크(토큰 포함)로 들어와야 한다.</p>');
    }
    // 토큰이 URL로 들어오면 쿠키로 승격 (이후 요청은 토큰 없이)
    if (url.searchParams.get('t') === TOKEN)
      res.setHeader('Set-Cookie', `mirhan_t=${TOKEN}; Path=/; Max-Age=31536000; SameSite=Lax`);
    if (url.pathname === '/api/snapshot') return json(res, 200, snapshot());
    if (url.pathname === '/api/log') return json(res, 200, readLogEntries());
    if (url.pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
      });
      res.write('retry: 3000\n\n');
      sseClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
      return;
    }
    if (url.pathname === '/api/oracle' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
      req.on('end', () => {
        try {
          const { decree, proclaimed } = JSON.parse(body);
          if (!decree || !String(decree).trim()) return json(res, 400, { error: 'decree가 비어 있다' });
          const entry = appendOracle(decree, proclaimed);
          log(`신탁 기록: ${entry.id} "${entry.decree}" (공표: ${entry.proclaimed})`);
          json(res, 200, entry);
        } catch (e) { json(res, 400, { error: e.message }); }
      });
      return;
    }
    // 정적 파일 (viewer/)
    let rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(VIEWER_DIR, rel));
    if (!file.startsWith(VIEWER_DIR)) return json(res, 403, { error: 'forbidden' });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, BIND, () => {
  log(`어항 뷰어: http://localhost:${PORT} (신의 창 — truth 전면 공개)`);
  if (EXPOSED) {
    for (const ip of lanAddresses()) log(`  같은 망에서: http://${ip}:${PORT}/?t=${TOKEN}`);
    log('  ↑ 토큰이 붙은 링크로만 열린다. 링크를 아는 사람은 세계의 모든 진실을 보고 신탁까지 내릴 수 있다.');
  } else log('  localhost 전용 — 외부 접속은 --host lan 으로 기동');
});
