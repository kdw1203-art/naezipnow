import "server-only";
import { postHref } from "@/lib/town/post-href";
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

/* [970 · B-02] 시/도 + 자치구 — "중구"만으로는 서울·인천·대구·울산·부산·대전 중구가 섞였다.
   city 가 비어 있으면(대표행에 시/도 없음) 예전처럼 자치구만으로 찾는다. */
export const loadRedevelopment = cache((sigungu: string, city: string) =>
  listProjects({ sigungu, sido: city || undefined, limit: 6 }),
);

export const loadAreaBands = cache((complexId: string) => getAreaBands(complexId));

export const loadRegionRelative = cache((complexId: string) => getRegionRelative(complexId));

/* 입주물량은 지역 키 데이터 캐시(948) 위에 요청 내 dedupe 를 한 겹 더 얹는다. */
/* [970 · B-02] 캐시 키에 시/도가 들어가므로 키 버전을 올린다(v1 은 자치구만으로 묶여 있었다) */
/* [1010] 6시간 → 7일. 판단 근거(왜 이 캐시는 TTL 을 올릴 가치가 있는가):
   ① 키가 (시군구, 시도) 라 **요청마다 달라지지 않는다** — 한 자치구의 단지 수백~수천 곳이
      같은 항목 하나를 공유한다(전국 ≈250키). 즉 미스(= ISR Write) 1회에 히트가 수백 번이다.
   ② 내용을 바꾸는 지점이 태그로 이미 이어져 있다 — 입주물량 적재 크론이
      invalidateAfterIngest("supply") 로 "supply" 태그를 비운다(app/api/cron/supply-ingest).
      그러니 TTL 은 신선도 장치가 아니라 안전망이고, 6시간은 "하루 1회도 안 바뀌는 자료"에
      비해 너무 촘촘했다(키당 하루 4회 재생성 × 250키 = 하루 1,000건의 읽히지도 않는 쓰기).
   ③ 반대로 키가 단지별이라 재사용이 없는 캐시는 TTL 을 올려도 소용이 없다 — 그래서
      단지 축(live-complex-axes)은 [1007] 에 데이터 캐시에서 아예 뺐다(아래 loadAxisContext). */
const loadSupplyDataCached = unstable_cache(
  (area: string, city: string) => getSupplyForAreaStrict(area, 24, undefined, city || null),
  ["upcoming-supply-v2"],
  { revalidate: 604_800, tags: ["supply"] },
);
export const loadUpcomingSupply = cache((area: string, city: string) =>
  loadSupplyDataCached(area, city),
);

/* [1007] 단지 축(live-complex-axes-v1)은 여기서 **데이터 캐시에 쓰지 않는다**(complexDurable:false).
   이 페이지는 ISR 6시간이고 그 캐시도 6시간이라, 페이지가 다시 렌더되는 순간엔 축 캐시도
   같이 만료돼 있다 — 즉 허브 렌더에서 그 항목은 늘 미스였고, 하루 8,907 렌더가 읽히지 않는
   항목 8,907개를 쓰고 있었다(ISR Writes). 지역 축(218개 키)은 단지들이 공유하므로 유지.
   [1010] 이 판단은 그대로 둔다 — 키가 단지별인 캐시는 TTL 을 올려도 재사용이 생기지 않는다.
   지역 축(lib/ai/live-context.ts live-region-axes, 6시간·market/supply/news/economy 태그)은
   지역 화면과 함께 쓰는 키라 이번 판에서 손대지 않았다(보고서에 남김 — 지역 축 담당과 겹친다). */
export const loadAxisContext = cache((complexId: string, regionName: string) =>
  buildLiveToolContextCached(complexId, regionName || null, { complexDurable: false }),
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
  /* [1007] DB 가 느린 몇 분 동안 렌더마다 섹션 수만큼 나오던 줄 — 섹션(what)별 1분 1건.
     첫 건은 그대로, 접힌 건수는 다음 줄에 붙는다(lib/log/sample.ts). */
  if (e instanceof SectionBudgetExpiredError) {
    logger.warnSampled(`section-budget:${what}`, `[section] ${what} 예산 초과로 접음: ${e.message}`);
    return;
  }
  logger.errorSampled(`section-fail:${what}`, `[complex] ${what} 조회 실패`, e);
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
    logger.errorSampled("complex-notes", "[complex] 임장노트 조회 실패", err);
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
      /* [1007] 사람 글은 /town/story/, 뉴스는 /town/news/ — 판정 한 곳(lib/town/post-href) */
      href: postHref(p),
      source: p.sourceName ? String(p.sourceName) : null,
      when: p.createdAt ? String(p.createdAt).slice(0, 10) : null,
    }));
  } catch (err) {
    logger.errorSampled("complex-news", "[complex] 관련 기사 조회 실패", err);
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
  const city = (args.city ?? "").trim();
  swallow(loadRentHistory(region, args.name));
  swallow(loadComplexQuestions(args.name.trim()));
  /* [970 · B-02] 섹션 컴포넌트와 같은 (자치구, 시/도) 인자 — 달라지면 dedupe 가 깨진다 */
  swallow(loadRedevelopment(dong.trim(), city));
  swallow(loadAreaBands(args.complexId));
  swallow(loadRegionRelative(args.complexId));
  swallow(loadUpcomingSupply(dong.trim(), city));
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
