#!/usr/bin/env node
// 이벤트 러너 (WO-010): 상주 프로세스. 마을 시간 = 현실 시간.
// 06:00~24:00 랜덤 1~3시간 간격으로 이벤트 1건씩 생성 → 기계 검증 → log.jsonl append
// (등급 1+는 timeline 승격) → 상태 갱신 → 커밋. 일요일에는 주간 배치(weekly.mjs)를 발화한다.
// 사용: node engine/event-runner.mjs [--test]   (--test: 간격 5~10분, 첫 이벤트 즉시)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, verifyWorld, loadCanaries } from './verify-world.mjs';
import { askClaude, parseSections, stripFence } from './claude-cli.mjs';

const TEST = process.argv.includes('--test');
const STATE_FILES = ['characters.json', 'places.json', 'factions.json', 'axes.json'];
const LOCK = path.join(ROOT, 'engine', '.runner.lock');
const HALT = path.join(ROOT, 'engine', '.world-halt');
const STATS = path.join(ROOT, 'engine', '.runner-stats.jsonl');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, body) => fs.writeFileSync(path.join(ROOT, rel), body, 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const now = () => new Date();
const log = (msg) => console.log(`[${now().toLocaleTimeString('ko-KR', { hour12: false })}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);

// ---------- 중복 실행 가드 (WO-009 계승) ----------
function acquireLock() {
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { alive = false; }
    if (alive) { console.error(`[runner] 이미 실행 중 (pid ${pid}) — 종료`); process.exit(1); }
    log(`오래된 lock (pid ${pid}) 제거`);
  }
  fs.writeFileSync(LOCK, String(process.pid), 'utf8');
  const release = () => { try { fs.unlinkSync(LOCK); } catch { /* noop */ } };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
}

// ---------- 마을 시계 ----------
const clock = readJson('world/clock.json');
function villageDate(d = now()) {
  const anchor = new Date(`${clock.anchor_date}T00:00:00`);
  const days = Math.floor((d - anchor) / 86400000);
  const week = clock.anchor_week + Math.floor(days / 7);
  const day = (days % 7) + 1;
  return { week, day, label: `기록력 1년 ${week}주 ${day}일` };
}

// ---------- 로그·예산 ----------
const readLog = () => read('world/log.jsonl').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const sameLocalDay = (a, b) => a.toDateString() === b.toDateString();

function budgetState() {
  const entries = readLog();
  const today = entries.filter((e) => sameLocalDay(new Date(e.ts), now()));
  const { week } = villageDate();
  const thisWeek = entries.filter((e) => e.week === week);
  return {
    grade1UsedToday: today.some((e) => e.grade >= 1),
    grade2UsedThisWeek: thisWeek.some((e) => e.grade >= 2),
    nightEventsThisWeek: thisWeek.filter((e) => { const h = new Date(e.ts).getHours(); return h < 6; }).length,
  };
}

function pendingOracles() {
  const { week } = villageDate();
  return readJson('world/oracles.json').filter((o) => o.cycle === null || o.cycle === week);
}

// ---------- 스케줄링 ----------
function nextEventTime() {
  const delayMs = TEST ? rand(5, 10) * 60000 : rand(60, 180) * 60000;
  let next = new Date(Date.now() + delayMs);
  const h = next.getHours();
  if (h < 6) {
    // 야간: 주 1회 이하로만 드물게 허용 (5% 확률), 아니면 06시 이후로 미룬다
    const allowNight = !TEST && budgetState().nightEventsThisWeek < 1 && Math.random() < 0.05;
    if (!allowNight) {
      next = new Date(next);
      next.setHours(6, Math.floor(rand(0, 59)), 0, 0);
    } else log('밤 사건 편성 (주 1회 예외)');
  }
  return next;
}

// ---------- 이벤트 생성 ----------
function eventPrompt(feedback) {
  const v = villageDate();
  const b = budgetState();
  const recent = readLog().slice(-20);
  const oracles = pendingOracles();
  return `${read('engine/event-engine.md')}

## 규칙서 (engine/rules.md — 모든 조항 준수)
${read('engine/rules.md')}

## 현재 world/ (진실)
${['characters.json', 'places.json', 'factions.json', 'axes.json', 'timeline.json']
    .map((f) => `### world/${f}\n${read(`world/${f}`)}`).join('\n')}

## 최근 이벤트 로그 (최신 20건)
${recent.length ? recent.map((e) => JSON.stringify(e)).join('\n') : '(아직 없음 — 실시간 전환 후 첫 이벤트들이다)'}

## 지금
- 현실/마을 시각: ${now().toLocaleString('ko-KR', { hour12: false })} (${v.label})
- 등급 예산: 오늘 등급 1+ ${b.grade1UsedToday ? '이미 사용됨 — 이번 이벤트는 반드시 등급 0' : '사용 가능'} / 이번 주 도시급(2) ${b.grade2UsedThisWeek ? '이미 사용됨' : '사용 가능'} / 시대급(3)은 ${oracles.length ? '신탁 있음 — 허용' : '신탁 없음 — 불가'}
${oracles.length ? `- 미처리 신탁: ${oracles.map((o) => o.decree).join(' / ')}` : ''}
${feedback ? `\n## 직전 산출물은 검증에 실패해 폐기되었다. 사유를 반영해 다시 생성하라:\n${feedback}` : ''}

## 출력 형식 (정확히 지켜라 — 기계가 파싱한다. 인사말·설명 금지)
===EVENT===
(JSON 객체 1개, 코드펜스 없이. 필드:
  "grade": 0~3,
  "log_line": "과거형 한 줄 — 누가 무엇을 했고 결과는 (규칙 20)",
  "truth": "...", "public_knowledge": "...",
  "dialogue": [ { "speaker": "인물 id 또는 무명 호칭", "line": "..." } ]  (대화 없으면 []),
  "staging": [ { "actor": "인물 id", "move_to": "장소 슬러그(예: bakery, dock, market, smithy, temple, saltfields)", "action": "동사(예: talk, work, walk, sit)" } ],
  "affected": [ 인물/구역/세력 id ],
  "state_diff_summary": "상태 변화 요약 한 줄 (없으면 '없음')",
  "timeline_id": "등급 1+일 때만 — timeline용 영문 슬러그" )
===WORLD:characters.json===
(갱신된 전체 내용 — 유효한 JSON만. 변화가 없어도 전체를 출력)
===WORLD:places.json===
===WORLD:factions.json===
===WORLD:axes.json===
(각 섹션 동일 규약. timeline.json과 oracles.json은 출력하지 마라 — 네 소관이 아니다)
===CANARY===
(이번 truth에만 있는 고유 식별 문구 0~2개, 한 줄에 하나. 공개 기록에 나올 표현 금지. 없으면 "없음")`;
}

function validateAndApply(text) {
  const s = parseSections(text);
  if (!s.EVENT) throw new Error('EVENT 섹션 없음');
  const ev = JSON.parse(stripFence(s.EVENT));
  const b = budgetState();
  const v = villageDate();

  // 등급 예산
  if (![0, 1, 2, 3].includes(ev.grade)) throw new Error(`grade '${ev.grade}' 무효`);
  if (ev.grade >= 1 && b.grade1UsedToday) throw new Error('예산 위반: 오늘 등급 1+ 이미 사용');
  if (ev.grade >= 2 && b.grade2UsedThisWeek) throw new Error('예산 위반: 이번 주 도시급 이미 사용');
  if (ev.grade === 3 && pendingOracles().length === 0) throw new Error('예산 위반: 신탁 없는 시대급');
  // log_line 형식
  if (typeof ev.log_line !== 'string' || !ev.log_line.trim() || /\n/.test(ev.log_line))
    throw new Error('log_line은 비어 있지 않은 한 줄이어야 한다');
  if (ev.log_line.length > 120) throw new Error('log_line이 120자를 넘는다');
  if (!ev.truth || !ev.public_knowledge) throw new Error('truth/public_knowledge 필수');
  if (ev.grade >= 1 && !ev.timeline_id) throw new Error('등급 1+에는 timeline_id 필수');

  const before = Object.fromEntries(STATE_FILES.map((f) => [f, read(`world/${f}`)]));
  const revert = () => { for (const f of STATE_FILES) write(`world/${f}`, before[f]); };
  try {
    for (const f of STATE_FILES) {
      if (!s[`WORLD:${f}`]) throw new Error(`WORLD:${f} 섹션 없음`);
      write(`world/${f}`, JSON.stringify(JSON.parse(stripFence(s[`WORLD:${f}`])), null, 2) + '\n');
    }
    // dialogue 화자·affected 참조 검증 (실존 id는 실존해야 하고, 무명 호칭은 허용)
    const charIds = new Set(readJson('world/characters.json').map((c) => c.id));
    for (const d of ev.dialogue ?? [])
      if (/^[a-z0-9-]+$/.test(d.speaker) && !charIds.has(d.speaker))
        throw new Error(`dialogue speaker '${d.speaker}' 미등록 id`);
    const errors = verifyWorld();
    if (errors.length) throw new Error(`무결성 위반:\n${errors.join('\n')}`);

    // timeline 승격 (등급 1+) — 러너가 append
    if (ev.grade >= 1) {
      const timeline = readJson('world/timeline.json');
      if (timeline.some((t) => t.id === ev.timeline_id)) throw new Error(`timeline_id '${ev.timeline_id}' 중복`);
      timeline.push({
        id: ev.timeline_id, cycle: v.week, date: v.label, grade: ev.grade,
        truth: ev.truth, public_knowledge: ev.public_knowledge, affected: ev.affected ?? [],
      });
      write('world/timeline.json', JSON.stringify(timeline, null, 2) + '\n');
    }

    // log append
    const entry = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: now().toISOString(), week: v.week, grade: ev.grade,
      log_line: ev.log_line.trim(), truth: ev.truth, public_knowledge: ev.public_knowledge,
      dialogue: ev.dialogue ?? [], staging: ev.staging ?? [],
      affected: ev.affected ?? [], state_diff_summary: ev.state_diff_summary ?? '없음',
    };
    fs.appendFileSync(path.join(ROOT, 'world/log.jsonl'), JSON.stringify(entry) + '\n');

    // canary 등록
    const additions = (s.CANARY ?? '').split(/\r?\n/).map((l) => l.trim())
      .filter((l) => l && l !== '없음' && !l.startsWith('#')).slice(0, 2);
    const existing = new Set(loadCanaries());
    const fresh = additions.filter((c) => !existing.has(c));
    if (fresh.length) fs.appendFileSync(path.join(ROOT, 'engine/truth-canary.txt'), fresh.join('\n') + '\n');

    return entry;
  } catch (e) {
    revert();
    throw e;
  }
}

function commit(entry) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'pipe' });
  git('add', 'world', 'engine/truth-canary.txt');
  git('-c', 'user.name=mirhan-engine', '-c', 'user.email=engine@mirhan.invalid',
    'commit', '-m', `이벤트: ${entry.log_line} [skip ci]`);
  try { git('push'); } catch { log('push 실패 — 다음 기회에 (커밋은 보존됨)'); }
}

async function fireEvent() {
  let feedback = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text, seconds } = askClaude(`event (시도 ${attempt})`, eventPrompt(feedback));
      const entry = validateAndApply(text);
      commit(entry);
      fs.appendFileSync(STATS, JSON.stringify({ ts: entry.ts, id: entry.id, grade: entry.grade, gen_seconds: seconds, attempt }) + '\n');
      log(`이벤트 [등급 ${entry.grade}] ${entry.log_line} (생성 ${seconds.toFixed(0)}초, 시도 ${attempt})`);
      return entry;
    } catch (e) {
      feedback = e.message;
      log(`이벤트 검증 실패 (시도 ${attempt}): ${e.message.split('\n')[0]}`);
    }
  }
  log('이벤트 폐기 — 세계 무변화, 다음 대기 (규칙 17)');
  return null;
}

// ---------- 주간 배치 감지 ----------
function weeklyDueWeeks() {
  // 완결된 주(경과) 중 연대기가 없는 주. 일요일 06시 이후에만 발화.
  const d = now();
  if (d.getDay() !== 0 || d.getHours() < 6) return [];
  const { week } = villageDate();
  const done = new Set(fs.readdirSync(path.join(ROOT, 'chronicle'))
    .map((f) => f.match(/^cycle-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number));
  const due = [];
  for (let w = clock.anchor_week; w < week; w++) if (!done.has(w)) due.push(w);
  return due;
}

function runWeekly(week) {
  log(`주간 배치 실행: ${week}주`);
  const res = spawnSync(process.execPath, [path.join(ROOT, 'engine/weekly.mjs'), String(week)],
    { cwd: ROOT, stdio: 'inherit', timeout: 40 * 60 * 1000 });
  if (res.status !== 0) log(`주간 배치 실패 (${week}주) — 다음 일요일에 재시도`);
}

// ---------- 메인 루프 ----------
async function main() {
  acquireLock();
  log(`이벤트 러너 기동 (${TEST ? '테스트 모드: 간격 5~10분' : '정상 모드: 간격 1~3시간, 야간 휴지'}) — ${villageDate().label}`);
  let next = TEST ? new Date(Date.now() + 5000) : nextEventTime();
  log(`다음 이벤트 예정: ${next.toLocaleString('ko-KR', { hour12: false })}`);
  for (;;) {
    if (fs.existsSync(HALT)) {
      log(`세계 정지 플래그 감지 (engine/.world-halt) — 운영자 확인 전까지 대기:\n${read('engine/.world-halt')}`);
      await sleep(10 * 60000);
      continue;
    }
    for (const w of weeklyDueWeeks()) runWeekly(w);
    if (Date.now() >= next.getTime()) {
      try {
        await fireEvent();
      } catch (e) {
        log(`이벤트 처리 중 예외 — 폐기하고 계속: ${e.message}`);
      }
      next = nextEventTime();
      log(`다음 이벤트 예정: ${next.toLocaleString('ko-KR', { hour12: false })}`);
    }
    await sleep(Math.min(30000, Math.max(1000, next.getTime() - Date.now())));
  }
}

process.on('uncaughtException', (e) => { console.error(`[runner] 치명적 예외: ${e.stack ?? e}`); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(`[runner] 처리되지 않은 rejection: ${e}`); process.exit(1); });
main().catch((e) => { console.error(`[runner] 메인 루프 종료: ${e.stack ?? e}`); process.exit(1); });
