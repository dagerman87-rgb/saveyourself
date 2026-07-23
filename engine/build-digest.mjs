#!/usr/bin/env node
// 주간 QA 다이제스트 (WO-008): docs/qa/week-NN.md 생성.
// 지난 다이제스트 이후의 사이클 보고를 연결하고, 텐션 지형과 제안(규칙 18)을 취합한다.
// 사용: node engine/build-digest.mjs [--no-commit]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './verify-world.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

const reportsDir = path.join(ROOT, 'docs/reports');
const qaDir = path.join(ROOT, 'docs/qa');
fs.mkdirSync(qaDir, { recursive: true });

const reportCycles = fs.existsSync(reportsDir)
  ? fs.readdirSync(reportsDir).map((f) => f.match(/^cycle-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b)
  : [];

const digests = fs.readdirSync(qaDir).map((f) => f.match(/^week-(\d+)\.md$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
let lastCovered = 0;
for (const d of digests) {
  const m = read(`docs/qa/week-${String(d).padStart(2, '0')}.md`).match(/<!-- cycles: \d+-(\d+) -->/);
  if (m) lastCovered = Math.max(lastCovered, Number(m[1]));
}

const fresh = reportCycles.filter((c) => c > lastCovered);
if (fresh.length === 0) {
  console.log('[digest] 새 사이클 보고 없음 — 생성 생략');
  process.exit(0);
}

const weekNo = digests.length + 1;
const NN = String(weekNo).padStart(2, '0');

// 보고에서 특정 헤딩 섹션 추출 (## 헤딩 ~ 다음 ## 직전)
function extractSection(body, headingRe) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    const isHeading = /^#{1,3}\s/.test(line);
    if (isHeading) inSection = headingRe.test(line);
    else if (inSection) out.push(line);
  }
  return out.join('\n').trim();
}

const perCycle = fresh.map((c) => {
  const rel = `docs/reports/cycle-${String(c).padStart(3, '0')}.md`;
  const body = read(rel);
  return {
    cycle: c,
    rel,
    tension: extractSection(body, /텐션 변화표/),
    proposals: extractSection(body, /제안|파이프라인 노트/),
    review: extractSection(body, /역사가 검수/),
  };
});

// 현재 텐션 지형 스냅샷
const chars = readJson('world/characters.json');
const places = readJson('world/places.json');
const factions = readJson('world/factions.json');
const axes = readJson('world/axes.json');
const snapshot = [
  '| 대상 | 종류 | tension |', '|---|---|---|',
  ...chars.map((c) => `| ${c.name} | 인물 | ${c.tension} |`),
  ...places.districts.map((d) => `| ${d.name} | 구역 | ${d.tension} |`),
  ...factions.map((f) => `| ${f.name} | ${f.kind} | ${f.tension} |`),
].join('\n');
const openAxes = axes.filter((a) => a.status === 'open')
  .map((a) => `- **${a.name}** (임계 초과 시작: ${a.over_threshold_since ?? '—'}): ${a.note}`).join('\n');

const body = `# 주간 QA 다이제스트 — week ${NN}
<!-- cycles: ${fresh[0]}-${fresh.at(-1)} -->

대상 사이클: ${fresh.join(', ')} · 생성 기준: docs/reports/

## 사이클 보고 (전문 링크)
${perCycle.map((p) => `- [사이클 ${p.cycle} 보고](../reports/${path.basename(p.rel)})`).join('\n')}

## 현재 텐션 지형 (다이제스트 생성 시점)
${snapshot}

### 열린 갈등 축
${openAxes || '- 없음'}

## 사이클별 텐션 변화표
${perCycle.map((p) => `### 사이클 ${p.cycle}\n${p.tension || '(보고에 변화표 없음)'}`).join('\n\n')}

## 제안 취합 (규칙 18)
${perCycle.map((p) => `### 사이클 ${p.cycle}\n${p.proposals || '없음'}`).join('\n\n')}

## 역사가 검수 노트
${perCycle.map((p) => `### 사이클 ${p.cycle}\n${p.review || '(없음)'}`).join('\n\n')}

---
이 파일을 QA 세션(클로드)으로 가져가 주간 검수를 진행한다.
`;

const rel = `docs/qa/week-${NN}.md`;
fs.writeFileSync(path.join(ROOT, rel), body, 'utf8');
console.log(`[digest] ${rel} 생성 (사이클 ${fresh.join(', ')})`);

if (!process.argv.includes('--no-commit')) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'inherit' });
  git('add', rel);
  git('-c', 'user.name=mirhan-engine', '-c', 'user.email=engine@mirhan.invalid',
    'commit', '-m', `주간 QA 다이제스트 week-${NN} (사이클 ${fresh[0]}~${fresh.at(-1)})`);
  if (!process.argv.includes('--no-push')) git('push');
}
