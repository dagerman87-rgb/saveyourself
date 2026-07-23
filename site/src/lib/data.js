// 사이트의 유일한 데이터 접근 계층.
// 원칙: 사이트는 기록 계층만 렌더링한다. world/의 진실 필드는 이 모듈 밖으로 나가지 않도록
// 허용 필드 allowlist로만 읽는다 (WO-007 데이터 접근 원칙).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

const CHARACTER_FIELDS = ['id', 'name', 'role', 'district', 'status', 'public'];
const DISTRICT_FIELDS = ['id', 'name', 'description'];
const ORACLE_FIELDS = ['id', 'cycle', 'decree'];

export function loadCharacters() {
  return readJson('world/characters.json').map((c) => pick(c, CHARACTER_FIELDS));
}

export function loadDistricts() {
  const places = readJson('world/places.json');
  return {
    city: pick(places.city, ['id', 'name']),
    districts: places.districts.map((d) => pick(d, DISTRICT_FIELDS)),
  };
}

export function loadProclaimedOracles() {
  return readJson('world/oracles.json')
    .filter((o) => o.proclaimed === true)
    .map((o) => pick(o, ORACLE_FIELDS));
}

function loadMarkdownDir(dir, pattern) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .map((f) => f.match(pattern) && { file: f, cycle: Number(f.match(pattern)[1]) })
    .filter(Boolean)
    .sort((a, b) => a.cycle - b.cycle)
    .map(({ file, cycle }) => {
      const body = fs.readFileSync(path.join(abs, file), 'utf8');
      const title = (body.match(/^#\s+(.+)$/m) || [])[1] ?? file;
      return { cycle, title, body };
    });
}

export const loadChronicles = () => loadMarkdownDir('chronicle', /^cycle-(\d+)\.md$/);
export const loadNews = () => loadMarkdownDir('records', /^news-cycle-(\d+)\.md$/);

export function latestCycle() {
  const cycles = [...loadChronicles(), ...loadNews()].map((d) => d.cycle);
  return cycles.length ? Math.max(...cycles) : 0;
}

// 인물 도감의 등장 기록 링크: 기록 본문에 이름이 언급된 문서를 자동 수집
export function appearancesOf(name) {
  const hit = (docs, kind) =>
    docs.filter((d) => d.body.includes(name)).map((d) => ({ kind, cycle: d.cycle }));
  return [...hit(loadChronicles(), 'chronicle'), ...hit(loadNews(), 'news')].sort(
    (a, b) => a.cycle - b.cycle
  );
}
