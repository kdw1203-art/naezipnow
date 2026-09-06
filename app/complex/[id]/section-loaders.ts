import "server-only";
import { cache } from "react";
import { getComplexRentHistoryByNames } from "@/lib/market/complex-rent";
import { listQuestionsForComplex } from "@/lib/qna/store";
import { listProjects } from "@/lib/redevelopment/store";
import { getAreaBands, getRegionRelative } from "@/lib/complex/complex-store";
import { getSupplyForAreaStrict } from "@/lib/market/supply";
import { buildLiveToolContextCached } from "@/lib/ai/live-context";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { readRelatedTownPosts } from "@/lib/newui/board-posts";
import { logger } from "@/lib/log";
import { startDeadline, SectionBudgetExpiredError, type Deadline } from "@/lib/data/section-budget";

/* [949 · 대규모 최적화] 단지 허브 곁다리 섹션의 조회를 **한 곳에서 React cache() 로
   감싼다** — 그래야 페이지 본문이 대표행을 받는 순간 미리 불을 붙여 두고(prefetch),
   섹션 컴포넌트가 같은 인자로 다시 부르면 이미 돌고 있는 약속을 그대로 받는다.

   왜 필요한가(실측 2026-09-02): 단지 콜드 렌더는 ①대표행 → ②대장 enrich →
   ③곁다리 5종 → (본문 확정 뒤) ④섹션 컴포넌트 7종 순으로 **네 파도**였다.
   ④는 ③이 끝나야 시작되는데 내용은 ①만 있으면 시작할 수 있는 것들이다
   (전월세 이력·Q&A·정비사업·면적대·지역 대비·입주물량·축 요약). 여기서 ④를 ③과
   같은 파도로 당긴다. 실사용 web_vitals 14일: /complex TTFB p75 1.42s, LCP p75 3.24s —
   ISR 미스는 스트리밍 없이 전체 렌더가 끝나야 첫 바이트가 나가므로 파도 수가
   곧 TTFB 다.

   규칙: 섹션 컴포넌트는 반드시 **여기 로더를 같은 인자로** 불러야 dedupe 가 된다.
   인자가 다르면 조용히 두 번 조회한다(틀리진 않지만 이득이 사라진다). 그래서
   지역 문자열 같은 파생 인자는 아래 헬퍼로만 만든다. */

/** ComplexRentSection·ComplexQna 가 쓰는 지역 문자열 — 본문 v.city/v.dong 과 같은 규칙. */
export function sectionRegionLabel(city: string | null | undefined, district: string | null | undefined): string {
  const dong = district || city || "지역";
  return `${city ?? ""} ${dong}`.trim();
}

/** ComplexAxisSummary 가 쓰는 지역명 — dec.region 포맷("서울 중랑구"), city===dong 중복 방어. */
export function axisRegionName(city: string | null | undefined, dong: string | null | undefined): string {
  return city && dong && city !== dong ? `${city} ${dong}` : (city ?? dong ?? "");
}

export const loadRentHistory = cache((region: string, name: string) =>
  getComplexRentHistoryByNames(region, name),
);

export const loadComplexQuestions = cache((name: string) => listQuestionsForComplex(name, 5));

export const loadRedevelopment = cache((sigungu: string) =>
  listProjects({ sigungu, limit: 6 }),
);

export const loadAreaBands = cache((complexId: string) => getAreaBands(complexId));

export const loadRegionRelative = cache((complexId: string) => getRegionRelative(complexId));

/* 입주물량은 지역 키 데이터 캐시(948) 위에 요청 내 dedupe 를 한 겹 더 얹는다. */
const loadSupplyDataCached = unstable_cache(
  (area: string) => getSupplyForAreaStrict(area, 24),
  ["upcoming-supply-v1"],
  { revalidate: 21_600, tags: ["supply"] },
);
export const loadUpcomingSupply = cache((area: string) => loadSupplyDataCached(area));

export const loadAxisContext = cache((complexId: string, regionName: string) =>
  buildLiveToolContextCached(complexId, regionName || null),
);

/* ── [968 · 1] 곁다리 섹션 공유 예산 3초 ─────────────────────────────────────
   왜: 본문의 곁다리 5종은 예산(settle)이 있었지만 섹션 컴포넌트 7종의 await 에는
   상한이 없었다. 로더 하나가 읽기 타임아웃(최대 45초)을 꽉 채우면 페이지 렌더
   전체가 그만큼 매달린다 — 이 라우트는 ISR(정적 생성) 이라 Suspense 로 먼저
   흘려보낼 수 없고(Next 는 static generation 에서 allReady 를 기다린다), 렌더
   시간이 곧 TTFB 다. 그래서 섹션에도 벽시계를 준다.

   시계는 **대표행(base)을 받은 순간**(prefetchComplexSections) 시작하고, 요청 안에서
   React cache() 로 하나만 만들어 모든 섹션이 같은 마감을 본다. 섹션 컴포넌트는
   본문 파도(실거래 8초 상한)가 끝난 뒤에 렌더되므로, 그 시점에 이미 끝난 로더는
   Promise.race 순서상 그대로 이긴다(먼저 settle 된 쪽이 앞에 있다) — 즉 "base 로부터
   3초, 또는 본문 파도가 끝나는 시점 중 늦은 쪽"까지 기다리는 셈이다.

   done() 을 부르지 않는다: 섹션 렌더는 page 함수가 돌아온 뒤에도 이어지므로
   "다 끝났다"를 알 자리가 없다. 3초 뒤 타이머가 한 번 울리고 끝(expired 는 no-op
   catch 가 붙어 있어 unhandledRejection 이 아니다). 로더에 signal 은 넘기지 않는다 —
   React cache() 키가 깨지고, 섹션 lib 함수가 signal 을 받지 않는다. */
export const SECTION_BUDGET_MS = 3_000;

const sectionDeadline = cache((): Deadline => startDeadline(SECTION_BUDGET_MS));

/** 마감 시계를 지금 시작한다(이미 시작했으면 그대로). prefetchComplexSections 가 부른다. */
export function startSectionBudget(): void {
  void sectionDeadline();
}

/**
 * 섹션 로더를 공유 예산에 건다. 예산을 넘기면 SectionBudgetExpiredError 로 **거절**된다 —
 * 섹션 컴포넌트는 예전과 같은 catch 로 "못 읽음"을 그리거나 접는다.
 * 배열 순서가 중요하다: work 가 이미 settle 돼 있으면 expired 가 이미 거절됐어도 work 가 이긴다.
 */
export function withSectionBudget<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, sectionDeadline().expired]);
}

/**
 * 섹션 실패 로그 — 예산 초과(설계대로 접힘)는 warn, 진짜 조회 실패는 error.
 * lib/data/section-budget.ts settle() 과 같은 구분(error 목록에 잡음을 섞지 않는다).
 */
export function logSectionFailure(what: string, e: unknown): void {
  if (e instanceof SectionBudgetExpiredError) {
    logger.warn(`[section] ${what} 예산 초과로 접음: ${e.message}`);
    return;
  }
  logger.error(`[complex] ${what} 조회 실패`, e);
}

/* ── [968 · 1] 임장노트·관련 기사 로더 — ComplexNotesNewsAi 에서 옮겨 옴 ────────
   왜: 이 둘은 컴포넌트 안에서 조회를 시작해 본문 파도가 끝난 **뒤에야** 출발했다
   (세 번째 파도). 인자(순수 id·이름·지역)는 대표행만 있으면 알 수 있으므로 다른
   섹션처럼 base 시점에 미리 띄운다. 쿼리·정규화·실패 처리는 그대로다. */

export interface HubInspectionNoteRow {
  id: string;
  title: string;
  region: string | null;
  visitDate: string | null;
}

/** 단지명 정규화 — /api/map/complex-notes 와 같은 기준 */
export function normalizeComplexName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

async function readInspectionNotes(
  complexId: string,
  name: string,
): Promise<{ notes: HubInspectionNoteRow[]; failed: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) return { notes: [], failed: true };
  const core = normalizeComplexName(name).replace(/[%_]/g, "");
  try {
    // complexId 가 정규 키다. 표기가 달라도 같은 단지로 묶인다.
    const byId = complexId
      ? await sb
          .from("inspection_notes")
          .select("id, title, region, visit_date")
          .filter("metadata->>complexId", "eq", complexId)
          .eq("is_public", true)
          .order("created_at", { ascending: false })
          .limit(6)
      : null;
    let rows = (byId?.data ?? []) as Array<Record<string, unknown>>;

    // 옛 노트에는 metadata.complexId 가 없다 — 이름으로 한 번 더 찾는다.
    if (rows.length === 0 && core.length >= 2) {
      const byName = await sb
        .from("inspection_notes")
        .select("id, title, region, visit_date, apt_name")
        .ilike("apt_name", `%${core}%`)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (byName.error) throw byName.error;
      rows = ((byName.data ?? []) as Array<Record<string, unknown>>).filter(
        (r) => normalizeComplexName(String(r.apt_name ?? "")) === core,
      );
    }

    return {
      notes: rows.slice(0, 6).map((r) => ({
        id: String(r.id),
        title: String(r.title ?? "임장노트"),
        region: r.region ? String(r.region) : null,
        visitDate: r.visit_date ? String(r.visit_date).slice(0, 10) : null,
      })),
      failed: false,
    };
  } catch (err) {
    logger.error("[complex] 임장노트 조회 실패", err);
    return { notes: [], failed: true };
  }
}

export const loadHubInspectionNotes = cache(readInspectionNotes);

export interface HubNewsRow {
  id: string;
  title: string;
  href: string;
  source: string | null;
  when: string | null;
}

async function readRelatedNews(name: string, region: string): Promise<HubNewsRow[]> {
  try {
    const posts = await readRelatedTownPosts();
    const core = normalizeComplexName(name);
    // 지역명은 "서울 노원구" 처럼 붙어 오므로 토막으로 쪼개 각각 본다.
    const regionTokens = region
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    const scored = posts
      .map((p) => {
        const hay = `${p.title ?? ""} ${(p.tags ?? []).join(" ")}`.replace(/\s+/g, "");
        if (core.length >= 2 && hay.includes(core)) return { p, score: 2 };
        if (regionTokens.some((t) => hay.includes(t))) return { p, score: 1 };
        return null;
      })
      .filter((v): v is { p: (typeof posts)[number]; score: number } => v !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scored.map(({ p }) => ({
      id: String(p.id),
      title: String(p.title ?? ""),
      href: `/town/news/${encodeURIComponent(String(p.id))}`,
      source: p.sourceName ? String(p.sourceName) : null,
      when: p.createdAt ? String(p.createdAt).slice(0, 10) : null,
    }));
  } catch (err) {
    logger.error("[complex] 관련 기사 조회 실패", err);
    return [];
  }
}

export const loadRelatedNews = cache(readRelatedNews);

/**
 * 본문 로더가 대표행을 받은 직후 부른다. 결과는 기다리지 않는다 — 섹션이 같은
 * 로더를 부를 때 이미 돌고 있는 약속을 받는다. 거절은 여기서 표식만 남긴다
 * (unhandled rejection 방지); 실제 실패 처리는 섹션 컴포넌트가 예전처럼 한다.
 */
const swallow = (p: Promise<unknown>) => {
  void p.catch(() => undefined);
};

export function prefetchComplexSections(args: {
  /** URL 의 순수 id — 면적대·지역 대비가 쓰는 키 */
  complexId: string;
  name: string;
  city: string | null;
  district: string | null;
}): void {
  /* [968 · 1] 섹션 예산 시계는 조회를 띄우는 이 순간부터 — 섹션이 3초 뒤에 물어도
     "base 로부터 3초"로 잰다 */
  startSectionBudget();
  const region = sectionRegionLabel(args.city, args.district);
  const dong = args.district || args.city || "지역";
  swallow(loadRentHistory(region, args.name));
  swallow(loadComplexQuestions(args.name.trim()));
  swallow(loadRedevelopment(dong.trim()));
  swallow(loadAreaBands(args.complexId));
  swallow(loadRegionRelative(args.complexId));
  swallow(loadUpcomingSupply(dong.trim()));
  /* [968 · 1] 임장노트·관련 기사 — 예전엔 ComplexNotesNewsAi 가 본문 뒤에 시작(세 번째 파도).
     인자 규칙은 그 컴포넌트가 부르는 것과 같아야 dedupe 된다(region = dong 하나). */
  swallow(loadHubInspectionNotes(args.complexId, args.name));
  swallow(loadRelatedNews(args.name, dong));
}

/** 축 요약은 enrich 가 끝난 뒤의 id(kapt 매칭 시 kapt 형태)를 키로 쓴다 — 따로 띄운다. */
export function prefetchAxisSummary(args: {
  rowId: string;
  city: string | null;
  district: string | null;
}): void {
  const dong = args.district || args.city || "지역";
  swallow(loadAxisContext(args.rowId, axisRegionName(args.city, dong)));
}
