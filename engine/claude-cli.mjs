// claude-cli 백엔드 (WO-009 계승): API 키 대신 로컬 Claude Code CLI(구독 인증)로 호출한다.
// 프롬프트는 stdin으로 전달 (인자 이스케이프 문제 회피), cwd는 격리 디렉터리
// (저장소의 CLAUDE.md·도구 접근을 피한다).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CLAUDE = process.env.CLAUDE_CLI ?? path.join(os.homedir(), '.mirhan', 'node', 'claude.cmd');
const SCRATCH = path.join(os.homedir(), '.mirhan', 'prompt-scratch');

export function askClaude(label, prompt, { model = 'opus', timeoutMs = 15 * 60 * 1000 } = {}) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const started = Date.now();
  const cmd = `"${CLAUDE}" -p --model ${model} --output-format text`;
  const res = spawnSync('cmd.exe', ['/d', '/s', '/c', cmd], {
    input: '도구를 사용하지 말고, 요구된 출력만 텍스트로 응답하라.\n\n' + prompt,
    encoding: 'utf8',
    cwd: SCRATCH,
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    windowsVerbatimArguments: true,
  });
  const seconds = (Date.now() - started) / 1000;
  if (res.error) throw new Error(`${label}: claude CLI 실행 실패 - ${res.error.message}`);
  if (res.status !== 0)
    throw new Error(`${label}: claude CLI 종료 코드 ${res.status} - ${String(res.stderr).slice(0, 400)}`);
  const out = String(res.stdout).trim();
  if (!out) throw new Error(`${label}: 빈 응답`);
  return { text: out, seconds };
}

// ===SECTION=== 구분자 응답 파싱 (run-cycle과 동일 규약)
export function parseSections(text) {
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

export const stripFence = (s) =>
  s.replace(/^```[a-z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
