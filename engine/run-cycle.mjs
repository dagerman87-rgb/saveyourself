#!/usr/bin/env node
// 사이클 자동 실행 파이프라인 (WO-008).
// 엔진 → 역사가 검수(반려 시 재생성 1회, 재반려 시 기록 소실) → 집필 → 신문 → 누출 검수 →
// 기계 검증 → 커밋. 실패(API 오류 포함) 시 커밋 없이 종료 코드 1.
// 사용: node engine/run-cycle.mjs [--no-commit] [--no-push]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { ROOT, verifyWorld, canaryScan, loadCanaries } from './verify-world.mjs';

const MODEL = 'claude-opus-4-8';
const WORLD_FILES = ['characters.json', 'places.json', 'factions.json', 'timeline.json', 'axes.json'];
const client = new Anthropic();

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, body) => fs.writeFileSync(path.join(ROOT, rel), body, 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const log = (msg) => console.log(`[run-cycle] ${msg}`);

async function ask(label, prompt, maxTokens = 32000) {
  log(`API 호출: ${label}`);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  });
  const message = await stream.finalMessage();
  usageLog.push({ label, usage: message.usage, stop: message.stop_reason });
  if (message.stop_reason !== 'end_turn')
    throw new Error(`${label}: 비정상 종료 (stop_reason=${message.stop_reason})`);
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// ===SECTION=== 구분자 응답을 { 이름: 본문 } 으로 파싱
function parseSections(text) {
  const sections = {};
  const re = /^===([A-Z_:.\-a-z0-9]+)===\s*$/gm;
  let match, prev = null;
  while ((match = re.exec(text)) !== null) {
    if (prev) sections[prev.name] = text.slice(prev.end, match.index).trim();
    prev = { name: match[1], end: re.lastIndex };
  }
  if (prev) sections[prev.name] = text.slice(prev.end).trim();
  return sections;
}

const stripFence = (s) => s.replace(/^```[a-z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- 상태 파악 ----------
const usageLog = [];
const pipelineNotes = [];
const timelineBefore = readJson('world/timeline.json');
const chronicleCycles = fs.readdirSync(path.join(ROOT, 'chronicle'))
  .map((f) => f.match(/^cycle-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number);
const reportCycles = fs.existsSync(path.join(ROOT, 'docs/reports'))
  ? fs.readdirSync(path.join(ROOT, 'docs/reports')).map((f) => f.match(/^cycle-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number)
  : [];
const CYCLE = Math.max(0, ...timelineBefore.map((e) => e.cycle ?? 0), ...chronicleCycles, ...reportCycles) + 1;
const NNN = String(CYCLE).padStart(3, '0');
log(`사이클 ${CYCLE} 시작`);

const oraclesBefore = readJson('world/oracles.json');
const pendingOracles = oraclesBefore.filter((o) => o.cycle === null || o.cycle === CYCLE);

const worldBefore = Object.fromEntries(WORLD_FILES.map((f) => [f, read(`world/${f}`)]));
const rules = read('engine/rules.md');
const chronicles = chronicleCycles.sort((a, b) => a - b)
  .map((n) => ({ cycle: n, body: read(`chronicle/cycle-${String(n).padStart(3, '0')}.md`) }));
const newsCycles = fs.readdirSync(path.join(ROOT, 'records'))
  .map((f) => f.match(/^news-cycle-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);

// ---------- 1. 세계 엔진 ----------
function engineFormatSpec() {
  return `## 출력 형식 (정확히 지켜라 — 기계가 파싱한다)
아래 구분자들로 나뉜 섹션만 출력하라. 인사말·설명 금지.
${WORLD_FILES.map((f) => `===WORLD:${f}===\n(갱신된 ${f} 전체 내용 — 유효한 JSON만, 코드펜스 없이)`).join('\n')}
===REPORT===
(world-engine.md "출력 2"의 사이클 보고 전문 — 마크다운. 사건 목록, 텐션 변화표, 미해결 갈등,
자기 점검, 제안(규칙 18). "# 사이클 ${CYCLE} 보고"로 시작하라)
===CANARY===
(이번 사이클 truth에만 존재하는 고유 식별 문구 1~3개, 한 줄에 하나. 규칙: 짧고(8~20자) truth
서술에 실제로 포함된 문구여야 하며, public_knowledge·연대기에 나올 법한 표현은 금지)`;
}

function enginePrompt(feedback) {
  return `너는 미르한의 세계 엔진이다. 아래 프롬프트가 곧 너의 역할 정의다.

${read('engine/world-engine.md')}

## 규칙서 (engine/rules.md — 모든 조항 준수)
${rules}

## 현재 world/ (진실)
${WORLD_FILES.map((f) => `### world/${f}\n${worldBefore[f]}`).join('\n')}

## 기존 연대기 (최근 3개)
${chronicles.slice(-3).map((c) => c.body).join('\n\n---\n\n')}

## 이번 실행: 사이클 ${CYCLE}
${pendingOracles.length
    ? `신탁 있음 — 다음 decree는 사실로 실현된다. 네가 정하는 것은 그 여파다:\n${pendingOracles.map((o) => `- ${o.decree} (proclaimed: ${o.proclaimed})`).join('\n')}`
    : '신탁 없음 (자율 사이클).'}
${feedback ? `\n## 역사가 반려 사유 (이전 산출물은 폐기되었다. 아래를 반영해 처음부터 다시 생성하라)\n${feedback}` : ''}

제약: timeline·oracles의 기존 항목은 한 글자도 수정 금지 (timeline은 append만). oracles.json은 네 소관이 아니다.
새 사건은 cycle: ${CYCLE}. axes.json은 규칙 4-1/4-2에 따라 갱신하라.

${engineFormatSpec()}`;
}

function applyEngineOutput(text) {
  const s = parseSections(text);
  for (const f of WORLD_FILES) if (!s[`WORLD:${f}`]) throw new Error(`엔진 출력에 WORLD:${f} 섹션 없음`);
  if (!s.REPORT) throw new Error('엔진 출력에 REPORT 섹션 없음');

  const parsed = Object.fromEntries(WORLD_FILES.map((f) => [f, JSON.parse(stripFence(s[`WORLD:${f}`]))]));

  // append-only 검증: 기존 timeline 항목은 불변, 신규는 cycle === CYCLE
  const newTimeline = parsed['timeline.json'];
  if (newTimeline.length < timelineBefore.length) throw new Error('timeline 항목이 줄었다 (append-only 위반)');
  timelineBefore.forEach((e, i) => {
    if (!deepEqual(e, newTimeline[i])) throw new Error(`timeline 기존 항목 수정됨: ${e.id} (append-only 위반)`);
  });
  const newEvents = newTimeline.slice(timelineBefore.length);
  if (newEvents.length < 1 || newEvents.length > 3) throw new Error(`신규 사건 ${newEvents.length}건 (규칙 5 위반)`);
  for (const e of newEvents) if (e.cycle !== CYCLE) throw new Error(`신규 사건 ${e.id}의 cycle이 ${CYCLE}이 아님`);

  for (const f of WORLD_FILES) write(`world/${f}`, JSON.stringify(parsed[f], null, 2) + '\n');
  const worldErrors = verifyWorld();
  if (worldErrors.length) throw new Error(`무결성 위반:\n${worldErrors.join('\n')}`);

  const canaryAdditions = (s.CANARY ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
  return { report: s.REPORT, newEvents, canaryAdditions };
}

function revertWorld() {
  for (const f of WORLD_FILES) write(`world/${f}`, worldBefore[f]);
}

// ---------- 2. 역사가 ----------
function historianPrompt(newEvents) {
  return `너는 미르한의 역사가다. 아래 프롬프트가 곧 너의 역할 정의다.

${read('engine/historian.md')}

## 규칙서 (검수 기준)
${rules}

## world/ 전체 (사이클 ${CYCLE} 반영 후)
${WORLD_FILES.map((f) => `### world/${f}\n${read(`world/${f}`)}`).join('\n')}

## 이번 사이클의 변경분 (신규 timeline 사건)
${JSON.stringify(newEvents, null, 2)}
(기존 사건·시드는 기계 검증으로 무수정이 확인되었다. 상태 필드 갱신 여부는 world/ 전체로 판단하라.)

## 기존 연대기 전체
${chronicles.map((c) => c.body).join('\n\n---\n\n')}

## 출력 형식 (정확히 지켜라)
===VERDICT===
pass 또는 reject (한 단어)
===NOTES===
(검수 결과: 확인 항목·판정 근거·특기 관찰·제안. 반려 시 위반 조항과 재생성 요구사항)
===CHRONICLE===
(통과 시에만: chronicle/cycle-${NNN}.md 전문. "# 미르한 연대기"로 시작. 반려 시 이 섹션 생략)`;
}

// ---------- 3. 신문 ----------
function newspaperPrompt(newEvents, issueNo) {
  const publicExtract = newEvents.map((e) =>
    `=== ${e.id} | ${e.date} | 등급 ${e.grade}\n${e.public_knowledge}`).join('\n\n');
  const prevNews = newsCycles.slice(-2).map((n) => read(`records/news-cycle-${String(n).padStart(3, '0')}.md`));
  return `너는 '부두 소식'의 기자다. 아래 프롬프트가 곧 너의 역할 정의다.

${read('engine/newspaper.md')}

## 이번 주(기록력 1년 ${CYCLE}주) 사건의 public_knowledge (timeline 입력의 전부 — truth는 주어지지 않는다)
${publicExtract}

## 기존 연대기 (공개 기록)
${chronicles.map((c) => c.body).join('\n\n---\n\n')}

## 기존 신문 (최근 호)
${prevNews.join('\n\n---\n\n') || '(없음)'}

## 이번 호: 제${issueNo}호 (규칙 19 — 지면 호수는 발행 순번)
사망자 언급이 public_knowledge에 없으면 부고란은 싣지 않는다.

## 출력 형식 (정확히 지켜라)
===NEWS===
(records/news-cycle-${NNN}.md 전문 — 마크다운)
===SUGGESTIONS===
(규칙 18 제안. 없으면 "없음")`;
}

function leakCheckPrompt(newsBody, newEvents) {
  return `너는 미르한의 역사가다. 규칙 15-3에 따라 신문 발행 전 truth 누출 여부만 검수한다.
문체·과장·소문은 판정하지 않는다.

## 이번 사이클 사건의 truth (엔진만 아는 정보)
${newEvents.map((e) => `=== ${e.id}\ntruth: ${e.truth}\npublic: ${e.public_knowledge}`).join('\n\n')}

## 인물의 비밀 (world/characters.json의 secret 필드)
${readJson('world/characters.json').map((c) => `- ${c.name}: ${c.secret}`).join('\n')}

## 검수 대상 신문 전문
${newsBody}

## 판정 기준
truth 전용 정보(public_knowledge·기존 연대기에 없는 것)가 지면에 단정적 사실로 실렸는가.

## 출력 형식
===VERDICT===
pass 또는 leak (한 단어)
===NOTES===
(누출 없음 근거 요약, 또는 누출 문장 목록과 사유)`;
}

// ---------- 파이프라인 ----------
async function main() {
  // 1~2. 엔진 → 역사가 (반려 시 1회 재생성)
  let engineResult = null, chronicleBody = null, historianNotes = '';
  let lostRecord = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const engineText = await ask(`engine (시도 ${attempt})`, enginePrompt(attempt === 2 ? historianNotes : null));
    engineResult = applyEngineOutput(engineText);
    const h = parseSections(await ask(`historian (시도 ${attempt})`, historianPrompt(engineResult.newEvents)));
    historianNotes = h.NOTES ?? '';
    if ((h.VERDICT ?? '').toLowerCase().startsWith('pass') && h.CHRONICLE) {
      chronicleBody = stripFence(h.CHRONICLE);
      break;
    }
    log(`역사가 반려 (시도 ${attempt}): ${historianNotes.slice(0, 200)}`);
    revertWorld();
    if (attempt === 2) lostRecord = true;
  }

  let newsBody = null, newsSuggestions = '', leakNotes = '';
  if (lostRecord) {
    // 규칙 17: 기록이 소실된 날. world/는 전진하지 않는다 (반려된 진실은 채택되지 않았다).
    log('재반려 — 기록 소실 처리');
    chronicleBody = `# 미르한 연대기 — 기록력 1년 ${CYCLE}주\n\n이 주의 기록은 소실되었다. 무엇이 있었는지는 기록되지 않았다.\n`;
    write(`chronicle/cycle-${NNN}.md`, chronicleBody);
    pipelineNotes.push(`기록 소실 (규칙 17): 역사가 2회 반려. 최종 반려 사유:\n${historianNotes}`);
  } else {
    write(`chronicle/cycle-${NNN}.md`, chronicleBody.endsWith('\n') ? chronicleBody : chronicleBody + '\n');

    // 3~4. 신문 → 누출 검수 (누출 시 1회 재작성, 재누출 시 결호)
    const issueNo = newsCycles.length + 1;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const feedback = attempt === 2 ? `\n\n## 직전 호는 truth 누출로 반려되었다. 아래를 수정해 다시 써라:\n${leakNotes}` : '';
      const n = parseSections(await ask(`newspaper (시도 ${attempt})`, newspaperPrompt(engineResult.newEvents, issueNo) + feedback));
      if (!n.NEWS) throw new Error('신문 출력에 NEWS 섹션 없음');
      const candidate = stripFence(n.NEWS);
      const lc = parseSections(await ask(`leak-check (시도 ${attempt})`, leakCheckPrompt(candidate, engineResult.newEvents)));
      leakNotes = lc.NOTES ?? '';
      if ((lc.VERDICT ?? '').toLowerCase().startsWith('pass')) {
        newsBody = candidate;
        newsSuggestions = n.SUGGESTIONS ?? '';
        break;
      }
      log(`누출 검수 실패 (시도 ${attempt})`);
      if (attempt === 2) pipelineNotes.push(`신문 결호: 누출 검수 2회 실패. 사유:\n${leakNotes}`);
    }
    if (newsBody) write(`records/news-cycle-${NNN}.md`, newsBody + '\n');

    // canary 추가 (엔진 제공분)
    if (engineResult.canaryAdditions.length) {
      const existing = new Set(loadCanaries());
      const fresh = engineResult.canaryAdditions.filter((c) => !existing.has(c));
      if (fresh.length) fs.appendFileSync(path.join(ROOT, 'engine/truth-canary.txt'), fresh.join('\n') + '\n');
      pipelineNotes.push(`canary 추가: ${fresh.join(' / ') || '(중복으로 생략)'}`);
    }

    // 신탁 bookkeeping: cycle null이던 미처리 신탁에 이번 사이클 번호 기입
    if (pendingOracles.some((o) => o.cycle === null)) {
      const oracles = oraclesBefore.map((o) => (o.cycle === null ? { ...o, cycle: CYCLE } : o));
      write('world/oracles.json', JSON.stringify(oracles, null, 2) + '\n');
    }
  }

  // 5. 기계 검증 (world + 기록 계층 canary)
  const worldErrors = verifyWorld();
  const leaks = canaryScan(['chronicle', 'records']);
  if (worldErrors.length || leaks.length)
    throw new Error(`최종 기계 검증 실패:\n${[...worldErrors, ...leaks].join('\n')}`);

  // 사이클 보고 저장
  fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
  const usageTable = usageLog.map((u) =>
    `| ${u.label} | ${u.usage.input_tokens} | ${u.usage.output_tokens} |`).join('\n');
  const report = [
    lostRecord ? `# 사이클 ${CYCLE} 보고 — 기록 소실` : engineResult.report,
    '\n## 역사가 검수\n', historianNotes,
    newsBody ? `\n## 신문 제안\n${newsSuggestions}\n\n## 누출 검수\n${leakNotes}` : '',
    pipelineNotes.length ? `\n## 파이프라인 노트\n${pipelineNotes.map((n) => `- ${n}`).join('\n')}` : '',
    `\n## API 사용량 (${MODEL})\n| 호출 | input | output |\n|---|---|---|\n${usageTable}`,
  ].join('\n');
  write(`docs/reports/cycle-${NNN}.md`, report + '\n');

  // 6. 커밋·push
  if (!process.argv.includes('--no-commit')) {
    const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'inherit' });
    git('add', '-A');
    git('-c', 'user.name=mirhan-engine', '-c', 'user.email=engine@mirhan.invalid',
      'commit', '-m', lostRecord ? `사이클 ${CYCLE}: 기록이 소실된 날` : `사이클 ${CYCLE}: 자동 실행`);
    if (!process.argv.includes('--no-push')) git('push');
  }
  log(`사이클 ${CYCLE} 완료${lostRecord ? ' (기록 소실)' : ''}${newsBody ? '' : ' (신문 결호)'}`);
}

main().catch((e) => {
  console.error(`[run-cycle] 실패 — 커밋하지 않는다: ${e.message}`);
  try { revertWorld(); } catch { /* 원복 실패는 git가 지킨다 */ }
  process.exit(1);
});
