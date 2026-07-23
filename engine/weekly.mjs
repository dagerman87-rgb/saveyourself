#!/usr/bin/env node
// 주간 배치 (WO-010): 일요일에 러너가 발화. 완결된 주 하나를 대상으로
// 역사가 주간 감사(위반 시 세계 정지 플래그) → 연대기 집필 → 신문 발행(누출 검수) →
// QA 다이제스트 → 커밋·push (deploy.yml 트리거).
// 사용: node engine/weekly.mjs <주 번호>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, verifyWorld, canaryScan } from './verify-world.mjs';
import { askClaude, parseSections, stripFence } from './claude-cli.mjs';

const WEEK = Number(process.argv[2]);
if (!Number.isInteger(WEEK) || WEEK < 7) { console.error('사용법: node engine/weekly.mjs <주 번호(>=7)>'); process.exit(1); }
const NNN = String(WEEK).padStart(3, '0');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, body) => fs.writeFileSync(path.join(ROOT, rel), body, 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const log = (m) => console.log(`[weekly:${WEEK}] ${m}`);

const allLog = read('world/log.jsonl').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const weekLog = allLog.filter((e) => e.week === WEEK);
const weekTimeline = readJson('world/timeline.json').filter((t) => t.cycle === WEEK);
const chronicles = fs.readdirSync(path.join(ROOT, 'chronicle'))
  .map((f) => f.match(/^cycle-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b)
  .map((n) => read(`chronicle/cycle-${String(n).padStart(3, '0')}.md`));
const newsCount = fs.readdirSync(path.join(ROOT, 'records')).filter((f) => /^news-cycle-\d+\.md$/.test(f)).length;

// log 표본: 등급 1+ 전부 + 등급 0에서 최대 30건
const sample = [
  ...weekLog.filter((e) => e.grade >= 1),
  ...weekLog.filter((e) => e.grade === 0).slice(-30),
];

const stats = {
  events: weekLog.length,
  grades: [0, 1, 2, 3].map((g) => weekLog.filter((e) => e.grade === g).length),
  night: weekLog.filter((e) => new Date(e.ts).getHours() < 6).length,
};

function historianPrompt() {
  return `너는 미르한의 역사가다. 아래 프롬프트가 곧 너의 역할 정의다.

${read('engine/historian.md')}

## 규칙서 (검수 기준 — 특히 15-4 주간 사후 감사)
${read('engine/rules.md')}

## world/ 전체 (현재 상태)
${['characters.json', 'places.json', 'factions.json', 'axes.json', 'timeline.json']
    .map((f) => `### world/${f}\n${read(`world/${f}`)}`).join('\n')}

## 이번 주(기록력 1년 ${WEEK}주)의 timeline 사건 (등급 1+)
${JSON.stringify(weekTimeline, null, 2)}

## 이번 주 log 표본 (등급 1+ 전부 + 등급 0 최근 30건 / 전체 ${stats.events}건, 등급 분포 0:${stats.grades[0]} 1:${stats.grades[1]} 2:${stats.grades[2]} 3:${stats.grades[3]})
${sample.map((e) => JSON.stringify(e)).join('\n') || '(이벤트 없음)'}

## 기존 연대기 전체
${chronicles.join('\n\n---\n\n')}

## 출력 형식 (정확히 지켜라)
===VERDICT===
pass 또는 halt (한 단어 — halt는 모순·canary 누출·중대한 규칙 위반을 발견해 세계를 정지시켜야 할 때만)
===NOTES===
(감사 결과: 확인 항목·판정 근거·특기 관찰·제안. halt 시 위반 내용과 정지 사유)
===CHRONICLE===
(pass 시에만: chronicle/cycle-${NNN}.md 전문 — 기록력 1년 ${WEEK}주의 공식 연대기.
등급 0 생활은 public_knowledge 범위 안에서 부기로 스치듯 다룰 수 있다. halt 시 이 섹션 생략)`;
}

function newspaperPrompt(issueNo) {
  const publicGrade1 = weekTimeline.map((t) => `=== ${t.id} | ${t.date} | 등급 ${t.grade}\n${t.public_knowledge}`).join('\n\n');
  const publicGrade0 = weekLog.filter((e) => e.grade === 0)
    .map((e) => `- [${new Date(e.ts).toLocaleString('ko-KR', { hour12: false })}] ${e.public_knowledge}`).join('\n');
  return `너는 '부두 소식'의 기자다. 아래 프롬프트가 곧 너의 역할 정의다.

${read('engine/newspaper.md')}

## 이번 주(기록력 1년 ${WEEK}주) 주요 사건의 public_knowledge (truth는 주어지지 않는다)
${publicGrade1 || '(등급 1+ 사건 없음)'}

## 이번 주 생활 소식 (등급 0의 public_knowledge — 뒷면 단신의 원천)
${publicGrade0 || '(없음)'}

## 기존 연대기 (공개 기록)
${chronicles.join('\n\n---\n\n')}

## 이번 호: 제${issueNo}호 (규칙 19)
사망자 언급이 public 정보에 없으면 부고란은 싣지 않는다.

## 출력 형식
===NEWS===
(records/news-cycle-${NNN}.md 전문 — 마크다운)
===SUGGESTIONS===
(규칙 18 제안. 없으면 "없음")`;
}

function leakCheckPrompt(newsBody) {
  return `너는 미르한의 역사가다. 규칙 15-3에 따라 신문 발행 전 truth 누출 여부만 검수한다.

## 이번 주 이벤트의 truth (엔진만 아는 정보)
${weekLog.map((e) => `- truth: ${e.truth}\n  public: ${e.public_knowledge}`).join('\n')}

## 인물의 비밀
${readJson('world/characters.json').map((c) => `- ${c.name}: ${c.secret}`).join('\n')}

## 검수 대상 신문 전문
${newsBody}

## 출력 형식
===VERDICT===
pass 또는 leak
===NOTES===
(근거 요약 또는 누출 문장 목록)`;
}

async function main() {
  const notes = [];
  // 1. 역사가 주간 감사 + 집필
  const h = parseSections(askClaude('historian-weekly', historianPrompt()).text);
  if (!(h.VERDICT ?? '').toLowerCase().startsWith('pass')) {
    write('engine/.world-halt', `주 ${WEEK} 감사에서 세계 정지 (규칙 15-4)\n\n${h.NOTES ?? '(사유 없음)'}\n`);
    commit(`세계 정지: ${WEEK}주 감사 위반 (규칙 15-4)`, false);
    console.error(`[weekly] HALT — 세계 정지 플래그 기록. 운영자 확인 필요.`);
    process.exit(2);
  }
  if (!h.CHRONICLE) throw new Error('통과인데 CHRONICLE 섹션 없음');
  const chronicleBody = stripFence(h.CHRONICLE);
  write(`chronicle/cycle-${NNN}.md`, chronicleBody.endsWith('\n') ? chronicleBody : chronicleBody + '\n');

  // 2. 신문 (누출 검수 1회 재시도, 재실패 시 결호)
  let newsBody = null, newsSuggestions = '', leakNotes = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const feedback = attempt === 2 ? `\n\n## 직전 호는 truth 누출로 반려되었다. 아래를 수정해 다시 써라:\n${leakNotes}` : '';
    const n = parseSections(askClaude(`newspaper (시도 ${attempt})`, newspaperPrompt(newsCount + 1) + feedback).text);
    if (!n.NEWS) throw new Error('NEWS 섹션 없음');
    const candidate = stripFence(n.NEWS);
    const lc = parseSections(askClaude(`leak-check (시도 ${attempt})`, leakCheckPrompt(candidate)).text);
    leakNotes = lc.NOTES ?? '';
    if ((lc.VERDICT ?? '').toLowerCase().startsWith('pass')) { newsBody = candidate; newsSuggestions = n.SUGGESTIONS ?? ''; break; }
    log(`누출 검수 실패 (시도 ${attempt})`);
    if (attempt === 2) notes.push(`신문 결호: 누출 검수 2회 실패.\n${leakNotes}`);
  }
  if (newsBody) write(`records/news-cycle-${NNN}.md`, newsBody + '\n');

  // 3. 기계 검증
  const errs = [...verifyWorld(), ...canaryScan(['chronicle', 'records'])];
  if (errs.length) throw new Error(`기계 검증 실패:\n${errs.join('\n')}`);

  // 4. 주간 보고 + QA 다이제스트
  fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'docs/qa'), { recursive: true });
  write(`docs/reports/week-${NNN}.md`,
    `# 주간 보고 — 기록력 1년 ${WEEK}주\n\n## 로그 통계\n- 이벤트 ${stats.events}건 (등급 0:${stats.grades[0]} / 1:${stats.grades[1]} / 2:${stats.grades[2]} / 3:${stats.grades[3]}, 밤 사건 ${stats.night}건)\n\n## 역사가 감사\n${h.NOTES ?? ''}\n\n## 신문 제안\n${newsSuggestions || '없음'}\n${notes.length ? `\n## 배치 노트\n${notes.map((n) => `- ${n}`).join('\n')}` : ''}\n`);

  const chars = readJson('world/characters.json');
  const places = readJson('world/places.json');
  const factions = readJson('world/factions.json');
  const axes = readJson('world/axes.json');
  const digestNo = String(fs.readdirSync(path.join(ROOT, 'docs/qa')).filter((f) => /^week-\d+\.md$/.test(f)).length + 1).padStart(2, '0');
  write(`docs/qa/week-${digestNo}.md`,
    `# 주간 QA 다이제스트 — week ${digestNo}\n<!-- cycles: ${WEEK}-${WEEK} -->\n\n대상: 기록력 1년 ${WEEK}주 · [주간 보고](../reports/week-${NNN}.md) · [연대기](../../chronicle/cycle-${NNN}.md)${newsBody ? ` · [신문](../../records/news-cycle-${NNN}.md)` : ' · 신문 결호'}\n\n## 로그 통계\n- 이벤트 ${stats.events}건 (등급 0:${stats.grades[0]} / 1:${stats.grades[1]} / 2:${stats.grades[2]} / 3:${stats.grades[3]}, 밤 사건 ${stats.night}건)\n\n## 현재 텐션 지형\n| 대상 | 종류 | tension |\n|---|---|---|\n${[
      ...chars.map((c) => `| ${c.name} | 인물 | ${c.tension} |`),
      ...places.districts.map((d) => `| ${d.name} | 구역 | ${d.tension} |`),
      ...factions.map((f) => `| ${f.name} | ${f.kind} | ${f.tension} |`),
    ].join('\n')}\n\n### 열린 갈등 축\n${axes.filter((a) => a.status === 'open').map((a) => `- **${a.name}**: ${a.note}`).join('\n') || '- 없음'}\n\n---\n이 파일을 QA 세션(클로드)으로 가져가 주간 검수를 진행한다.\n`);

  // 5. 커밋·push ([skip ci] 없이 — deploy.yml 트리거)
  commit(`주간 배치 ${WEEK}주: 연대기${newsBody ? ' + 신문' : ' (신문 결호)'} + 다이제스트`, true);
  log(`완료 — 연대기${newsBody ? '·신문' : ''}·다이제스트 발행`);
}

function commit(msg, push) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'pipe' });
  git('add', '-A');
  git('-c', 'user.name=mirhan-engine', '-c', 'user.email=engine@mirhan.invalid', 'commit', '-m', msg);
  if (push) { try { git('push'); } catch { log('push 실패 — 커밋은 보존됨'); } }
}

main().catch((e) => { console.error(`[weekly] 실패: ${e.message}`); process.exit(1); });
