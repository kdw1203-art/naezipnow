/* [1149 · 전국 정비구역 목록] 국토교통부 "전국 도시정비사업 통합 데이터"(공공데이터포털 15160169 · api.odcloud.kr).
   항목: 시도 · 시군구 · 구역명칭 · 현 사업추진단계 · 사업유형 · 사업시행자 · 공급 예정 세대수. **좌표 · 경계는 없다** — 지도에 찍지 않고 목록으로만 보인다.
   순수 규칙(server-only 없음) — 적재 · 목록 화면 · node:test 가 같이 쓴다. */

export const NATIONAL_DATASET = "국토교통부 전국 도시정비사업 통합 데이터";
export const NATIONAL_DATASET_URL = "https://www.data.go.kr/data/15160169/fileData.do";
export const NATIONAL_API_PATH = "15160169/v1/uddi:4d7f16a9-b0fd-4d07-b266-d0ad82aeaf34";
export const NATIONAL_PAGE_SIZE = 30;

export type NationalZone = {
  id: string;
  sido: string;
  sigungu: string;
  name: string;
  stage: string | null;
  projectType: string | null;
  operator: string | null;
  households: number | null;
};

const s = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/** [1151] 공표 자료의 분류 값은 "3)재건축(공동주택)" · "2)정비구역지정" 처럼 순번이 붙어 온다 — 화면에는 순번을 떼고 보인다(실측 2026-11-11) */
export function stripOrdinal(v: string | null | undefined): string | null {
  const t = s(v).replace(/^\d{1,2}\)\s*/, "");
  return t || null;
}

/** 같은 시군구 안에서 구역명칭이 열쇠다 — 공백 · 대소문자 차이는 같은 구역으로 */
export function nationalZoneId(sido: string, sigungu: string, name: string): string {
  return [sido, sigungu, name].map((x) => s(x).replace(/\s/g, "").toLowerCase()).join("|");
}

/** 세대수 — 숫자만 · 0 이하나 글자는 모름(null). 지어내지 않는다 */
export function parseHouseholds(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : null;
}

/** 응답 한 줄 → 구역. 시도 · 시군구 · 구역명칭 중 하나라도 없으면 버린다 */
export function parseNationalRow(raw: unknown): NationalZone | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sido = s(r["시도"]);
  const sigungu = s(r["시군구"]);
  const name = s(r["구역명칭"]);
  if (!sido || !sigungu || !name) return null;
  return {
    id: nationalZoneId(sido, sigungu, name),
    sido,
    sigungu,
    name: name.slice(0, 120),
    stage: stripOrdinal(s(r["현 사업추진단계"])),
    projectType: stripOrdinal(s(r["사업유형"])),
    operator: stripOrdinal(s(r["사업시행자"]).slice(0, 120)),
    households: parseHouseholds(r["공급 예정 세대수"]),
  };
}

export type NationalListParams = { sido: string; sigungu: string; q: string; page: number };

export function nationalQuery(raw: unknown): string {
  return String(typeof raw === "string" ? raw : "").replace(/[,()%*\\{}"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function parseNationalParams(sp: Record<string, string | string[] | undefined>): NationalListParams {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const n = Number.parseInt(one("page") ?? "1", 10);
  return { sido: nationalQuery(one("sido")), sigungu: nationalQuery(one("sigungu")), q: nationalQuery(one("q")), page: Number.isFinite(n) && n >= 1 ? Math.min(n, 2000) : 1 };
}

export function nationalHref(p: Partial<NationalListParams>): string {
  const qs = new URLSearchParams();
  if (p.sido) qs.set("sido", p.sido);
  if (p.sigungu) qs.set("sigungu", p.sigungu);
  if (p.q) qs.set("q", p.q);
  if (p.page && p.page > 1) qs.set("page", String(p.page));
  const t = qs.toString();
  return t ? `/redev-list?${t}` : "/redev-list";
}
