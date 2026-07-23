import { marked } from 'marked';

export const md = (text) => marked.parse(text, { async: false });

// 신문 원문을 '---' 구분선 기준의 지면 구획으로 나눈다 (마스트헤드 / 1면 / 단신 / 떠도는 말 / 날씨...)
export function newsSections(body) {
  return body
    .split(/\n---+\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      heading: (block.match(/^##\s+(.+)$/m) || [])[1] ?? null,
      html: md(block),
    }));
}
