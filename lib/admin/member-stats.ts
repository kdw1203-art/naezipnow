/* [1141 · 회원 조회] 순수 규칙 — 기본 정보 통계 · 화면에 내보일 값 줄이기(server-only 없음 · node:test 가 그대로 부른다).
   관리자 화면이라도 필요한 만큼만 보인다: 생년월일은 연령대로, 휴대전화는 가운데를 가리고, 주소는 시·구까지만. */

export type BasicRow = { birth: string | null; address: string | null; job: string | null; housing: string | null; purpose: string | null };

/** YYMMDD → 만 나이. 2000년대로 읽어 14세 이상이면 그쪽, 아니면 1900년대(가입은 만 14세 이상) */
export function ageFromBirth6(birth: string | null, nowIso: string): number | null {
  if (!birth || !/^\d{6}$/.test(birth)) return null;
  const now = new Date(Date.parse(nowIso) + 9 * 3_600_000);
  const y = now.getUTCFullYear();
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const yy = Number(birth.slice(0, 2));
  const bmd = Number(birth.slice(2));
  const ageOf = (year: number) => y - year - (md < bmd ? 1 : 0);
  const young = ageOf(2000 + yy);
  return young >= 14 ? young : ageOf(1900 + yy);
}

export function ageBand(age: number | null): string {
  if (age === null) return "미입력";
  if (age < 20) return "10대";
  if (age >= 60) return "60대 이상";
  return `${Math.floor(age / 10) * 10}대`;
}

const SIDO: Array<[RegExp, string]> = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
  [/^경기/, "경기"], [/^강원/, "강원"], [/^충(청)?북/, "충북"], [/^충(청)?남/, "충남"], [/^전(라)?북/, "전북"], [/^전(라)?남/, "전남"], [/^경(상)?북/, "경북"], [/^경(상)?남/, "경남"], [/^제주/, "제주"],
];

/** 주소 첫 낱말 → 시·도. 못 알아보면 "기타" */
export function sidoOf(address: string | null): string {
  const first = (address ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return "미입력";
  for (const [re, name] of SIDO) if (re.test(first)) return name;
  return "기타";
}

/** 화면용 — 시·구까지만(번지 · 동호수는 내보이지 않는다) */
export function addressBrief(address: string | null): string {
  const parts = (address ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? "미입력" : parts.slice(0, 2).join(" ");
}

/** 화면용 — 가운데 자리를 가린다 */
export function phoneMasked(phone: string | null): string {
  const m = /^(\d{3})-(\d{3,4})-(\d{4})$/.exec(phone ?? "");
  return m ? `${m[1]}-${"*".repeat(m[2].length)}-${m[3]}` : phone ? "형식 다름" : "미입력";
}

export type Tally = Array<{ label: string; count: number }>;

function tally(values: string[]): Tally {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
}

export function basicStats(rows: BasicRow[], nowIso: string): { total: number; age: Tally; region: Tally; job: Tally; housing: Tally; purpose: Tally } {
  return {
    total: rows.length,
    age: tally(rows.map((r) => ageBand(ageFromBirth6(r.birth, nowIso)))),
    region: tally(rows.map((r) => sidoOf(r.address))),
    job: tally(rows.map((r) => r.job ?? "미입력")),
    housing: tally(rows.map((r) => r.housing ?? "미입력")),
    purpose: tally(rows.map((r) => r.purpose ?? "미입력")),
  };
}

/** 검색어 — PostgREST or() 를 깨는 글자를 빼고 60자까지 */
export function memberQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
