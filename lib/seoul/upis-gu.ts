/* [1045] 서울 자치구별 도시계획 결정 조서 화면(/redevelopment/seoul/[gu])의 순수 규칙 — 주소 · 요약 · 사이트맵 날짜.
 *
 * 왜 생겼나: /sitemap-redevelopment.xml 은 2026-07-22 에 손으로 정리한 구역 40곳(redevelopment_projects)만 싣고 있었다.
 * 그 표는 그날 이후 갱신이 없다. 반면 매일 적재되는 서울 UPIS 조서(seoul_upis_records · 11,302행)는 /redevelopment 의
 * 검색 칸 안에만 있어 색인에 한 건도 없었다 — 운영 점검(seo.sitemap_source · dead_source)이 정확히 그 점을 짚었다.
 * 조서 한 건은 한 줄짜리라 건별 화면은 얇다. 자치구 25곳으로 묶으면 화면마다 159~725건이 선다.
 *
 * 주소의 구 낱말은 지역 카탈로그 id 그대로(gangnam · mapo …) — /town/[region] · /region/[id] 와 같은 낱말이라 서로 잇기 쉽다.
 * 서버 전용이 아니다(단위 테스트 · 사이트맵 · 화면 공용). 조회는 lib/seoul/upis-store.ts. */
import { SEOUL_DISTRICTS } from "@/lib/map/seoul-districts";
import { UPIS_SERVICES, type UpisRecord, type UpisService } from "./upis-display";

export type SeoulGu = { slug: string; name: string };

/** 서울 자치구 25곳 — 카탈로그 순서(가나다) */
export const SEOUL_GU: readonly SeoulGu[] = SEOUL_DISTRICTS.map((d) => ({ slug: d.id, name: d.name }));

export const SEOUL_GU_INDEX_HREF = "/redevelopment/seoul";

export function seoulGuHref(slug: string): string {
  return `${SEOUL_GU_INDEX_HREF}/${slug}`;
}

const BY_SLUG = new Map(SEOUL_GU.map((g) => [g.slug, g]));
const BY_NAME = new Map(SEOUL_GU.map((g) => [g.name, g]));

export function seoulGuBySlug(slug: string | null | undefined): SeoulGu | null {
  return (slug && BY_SLUG.get(slug)) || null;
}

/** "강남구" → {slug:"gangnam"} — 조서의 sigungu 칸은 "○○구" 꼴이다(lib/seoul/upis.ts upisSigungu) */
export function seoulGuByName(name: string | null | undefined): SeoulGu | null {
  return (name && BY_NAME.get(name.trim())) || null;
}

export type UpisCount = { label: string; n: number };

export type UpisGuDigest = {
  total: number;
  /** 프로젝트 코드가 다른 묶음 수 — 한 구역(사업)에 조서가 여러 건 붙는다(신설 · 변경 · 폐지) */
  zones: number;
  byService: Record<UpisService, number>;
  /** 조서 유형(신설 · 변경 · 폐지 …) — 많은 순 · 원문 그대로 */
  byType: UpisCount[];
  /** 읍면동 — 많은 순(위치명에서 동을 못 읽은 조서는 세지 않는다) */
  byEmd: UpisCount[];
  /** 가장 최근 결정일(YYYY-MM-DD) — 없으면 null */
  lastDate: string | null;
  /** 날짜가 있는 조서 중 가장 이른 결정일 */
  firstDate: string | null;
};

function countBy(values: readonly (string | null)[]): UpisCount[] {
  const m = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko"));
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 한 구의 조서 묶음 → 화면 요약. 지어내는 값 없음 — 전부 손에 든 행에서 센다. */
export function digestGuRecords(rows: readonly UpisRecord[]): UpisGuDigest {
  const byService = { upisRebuild: 0, upisUrbanDev: 0, upisDistUnitPlan: 0 } as Record<UpisService, number>;
  const zones = new Set<string>();
  let lastDate: string | null = null;
  let firstDate: string | null = null;
  for (const r of rows) {
    if ((UPIS_SERVICES as readonly string[]).includes(r.service)) byService[r.service] += 1;
    if (r.prjcCd) zones.add(r.prjcCd);
    const d = r.codeDate && ISO_DAY_RE.test(r.codeDate) ? r.codeDate : null;
    if (d) {
      if (!lastDate || d > lastDate) lastDate = d;
      if (!firstDate || d < firstDate) firstDate = d;
    }
  }
  return {
    total: rows.length,
    zones: zones.size,
    byService,
    byType: countBy(rows.map((r) => r.rptType)),
    byEmd: countBy(rows.map((r) => r.emd)),
    lastDate,
    firstDate,
  };
}

/**
 * 사이트맵 <lastmod> 로 쓸 시각 — 그 구의 **가장 최근 결정일**(한국 시간 자정).
 *
 * 왜 적재 시각(fetched_at)이 아닌가: 적재는 매일 전량을 다시 읽어 덮어쓴다. 그 시각을 적으면 원천이 한 달째 조용해도
 * 사이트맵은 "오늘 바뀌었다"고 말한다 — 크롤러에게 하는 거짓말이다. 화면이 실제로 달라지는 때는 새 결정이 실릴 때다.
 * 결정일이 없거나 꼴이 틀리면 null(추측한 날짜를 적지 않는다).
 */
export function guLastmod(lastDate: string | null | undefined): Date | null {
  if (!lastDate || !ISO_DAY_RE.test(lastDate)) return null;
  const t = Date.parse(`${lastDate}T00:00:00+09:00`);
  return Number.isFinite(t) ? new Date(t) : null;
}
