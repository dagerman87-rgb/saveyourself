#!/usr/bin/env node
// 기계 검증 게이트: world/ JSON 파싱 + 참조 무결성 + truth-canary 스캔.
// CI(배포 전)와 run-cycle.mjs(사이클 종료 시)가 공유한다. 실패 시 종료 코드 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

export function verifyWorld() {
  const errors = [];
  let characters, places, factions, timeline, oracles, axes, upcoming;
  try {
    characters = readJson('world/characters.json');
    places = readJson('world/places.json');
    factions = readJson('world/factions.json');
    timeline = readJson('world/timeline.json');
    oracles = readJson('world/oracles.json');
    axes = readJson('world/axes.json');
    upcoming = fs.existsSync(path.join(ROOT, 'world/upcoming.json')) ? readJson('world/upcoming.json') : [];
  } catch (e) {
    return [`JSON 파싱 실패: ${e.message}`];
  }

  const charIds = new Set(characters.map((c) => c.id));
  const districtIds = new Set(places.districts.map((d) => d.id));
  const factionIds = new Set(factions.map((f) => f.id));
  const eventIds = new Set(timeline.map((e) => e.id));
  const knownIds = new Set([...charIds, ...districtIds, ...factionIds, places.city.id]);

  for (const c of characters) {
    if (!districtIds.has(c.district)) errors.push(`${c.id}: district '${c.district}' 미등록`);
    if (c.origin_district && !districtIds.has(c.origin_district))
      errors.push(`${c.id}: origin_district '${c.origin_district}' 미등록`);
    for (const s of c.scars ?? [])
      if (!eventIds.has(s.event_id)) errors.push(`${c.id}: scar event_id '${s.event_id}' 미등록`);
    for (const rid of Object.keys(c.relationships ?? {}))
      if (!charIds.has(rid)) errors.push(`${c.id}: 관계 대상 '${rid}' 미등록`);
    if (!c.wish?.text || !c.wish?.status) errors.push(`${c.id}: wish 구조 위반`);
    if ((c.quirks ?? []).length < 2) errors.push(`${c.id}: quirks 2개 미만`);
  }
  for (const f of factions)
    for (const m of f.members ?? [])
      if (!charIds.has(m)) errors.push(`${f.id}: member '${m}' 미등록`);
  for (const e of timeline) {
    if (e.cycle !== null && (!Number.isInteger(e.cycle) || e.cycle < 1))
      errors.push(`${e.id}: cycle '${e.cycle}' 규칙 위반 (양의 정수 또는 null)`);
    for (const a of e.affected ?? [])
      if (!knownIds.has(a)) errors.push(`${e.id}: affected '${a}' 미등록`);
  }
  for (const ax of axes)
    for (const p of ax.parties ?? [])
      if (!knownIds.has(p)) errors.push(`axes ${ax.id}: party '${p}' 미등록`);
  for (const u of upcoming) {
    if (!u.id || !u.title || isNaN(new Date(u.due))) errors.push(`upcoming ${u.id ?? '(id 없음)'}: 구조 위반 (id/title/due)`);
    if (!['pending', 'resolved'].includes(u.status)) errors.push(`upcoming ${u.id}: status '${u.status}' 무효`);
    if (u.status === 'resolved' && !u.resolved_by) errors.push(`upcoming ${u.id}: resolved인데 resolved_by 없음`);
  }
  void oracles;
  return errors;
}

export function loadCanaries() {
  return fs
    .readFileSync(path.join(ROOT, 'engine', 'truth-canary.txt'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// dirs: ROOT 기준 상대 경로. 존재하지 않는 디렉터리는 건너뛴다.
export function canaryScan(dirs) {
  const canaries = loadCanaries();
  const hits = [];
  const walk = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(md|html|txt|json|js|xml)$/i.test(entry.name)) {
        const body = fs.readFileSync(p, 'utf8');
        for (const c of canaries) if (body.includes(c)) hits.push(`${path.relative(ROOT, p)}: "${c}"`);
      }
    }
  };
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs);
  }
  return hits;
}

// CLI: node engine/verify-world.mjs [--scan chronicle records site/dist]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scanIdx = process.argv.indexOf('--scan');
  const scanDirs = scanIdx >= 0 ? process.argv.slice(scanIdx + 1) : ['chronicle', 'records'];

  const worldErrors = verifyWorld();
  const leaks = canaryScan(scanDirs);

  if (worldErrors.length === 0) console.log('world/ 무결성: OK');
  else worldErrors.forEach((e) => console.error(`[world] ${e}`));

  if (leaks.length === 0) console.log(`canary 스캔 (${scanDirs.join(', ')}): 누출 0건`);
  else leaks.forEach((l) => console.error(`[canary] 누출: ${l}`));

  process.exit(worldErrors.length + leaks.length === 0 ? 0 : 1);
}
