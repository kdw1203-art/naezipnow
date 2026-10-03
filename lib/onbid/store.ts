import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

/** 온비드 공매 물건 읽기 전용 로더. */

export type AuctionItem = {
  id: number;
  externalKey: string;
  name: string | null;
  prptDiv: string | null;
  usage: string | null;
  sido: string | null;
  sigungu: string | null;
  emd: string | null;
  appraisalKrw: number | null;
  minBidKrw: number | null;
  minBidText: string | null;
  landSqms: number | null;
  bldSqms: number | null;
  bidBegin: string | null;
  bidEnd: string | null;
  status: string | null;
  onbidCltrno: string | null;
  cltrMngNo: string | null;
  pbctNo: string | null;
};

/** 물건 유형 키워드 → 표시 카테고리 */
export const AUCTION_USAGE_FILTERS: { key: string; label: string; match: string[] }[] = [
  { key: "apt", label: "아파트", match: ["아파트"] },
  { key: "officetel", label: "오피스텔", match: ["오피스텔"] },
  { key: "villa", label: "빌라·연립", match: ["다세대", "연립", "빌라"] },
  { key: "house", label: "단독·다가구", match: ["단독", "다가구"] },
  { key: "land", label: "토지", match: ["대지", "토지", "전", "답", "임야"] },
  { key: "comm", label: "상가·업무", match: ["상가", "근린", "業務", "업무", "사무"] },
];

function mapRow(r: Record<string, unknown>): AuctionItem {
  return {
    id: Number(r.id),
    externalKey: String(r.external_key),
    name: r.name ? String(r.name) : null,
    prptDiv: r.prpt_div ? String(r.prpt_div) : null,
    usage: r.usage_scls ? String(r.usage_scls) : r.usage_mcls ? String(r.usage_mcls) : null,
    sido: r.sido ? String(r.sido) : null,
    sigungu: r.sigungu ? String(r.sigungu) : null,
    emd: r.emd ? String(r.emd) : null,
    appraisalKrw: r.appraisal_krw != null ? Number(r.appraisal_krw) : null,
    minBidKrw: r.min_bid_krw != null ? Number(r.min_bid_krw) : null,
    minBidText: r.min_bid_text ? String(r.min_bid_text) : null,
    landSqms: r.land_sqms != null ? Number(r.land_sqms) : null,
    bldSqms: r.bld_sqms != null ? Number(r.bld_sqms) : null,
    bidBegin: r.bid_begin ? String(r.bid_begin) : null,
    bidEnd: r.bid_end ? String(r.bid_end) : null,
    status: r.status ? String(r.status) : null,
    onbidCltrno: r.onbid_cltrno ? String(r.onbid_cltrno) : null,
    cltrMngNo: r.cltr_mng_no ? String(r.cltr_mng_no) : null,
    pbctNo: r.pbct_no ? String(r.pbct_no) : null,
  };
}

/**
 * 입찰마감(bid_end)이 오늘보다 이전인지 판정.
 * bid_end 는 온비드 원문 텍스트 컬럼("YYYYMMDDHHMM"·"YYYY-MM-DD HH:MM" 등 형식 관용) —
 * 숫자만 추출해 날짜로 해석하고, 형식 불명·미상은 "지난 것"으로 단정하지 않는다.
 */
export function isPastBidEnd(bidEnd: string | null, now: Date = new Date()): boolean {
  if (!bidEnd) return false;
  const digits = bidEnd.replace(/\D/g, "");
  if (digits.length < 8) return false;
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const da = Number(digits.slice(6, 8));
  if (!y || !mo || !da) return false;
  const end = new Date(y, mo - 1, da);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() < today.getTime();
}

/* 2026-07-26: 아래 두 함수는 실패할 때 `[]`·`0` 을 돌려줬다. 그러면 화면은
   "진행·예정 물건 0건 / 조건에 맞는 물건이 없어요" 라고 그린다 — 공매 물건이
   실제로 없는 것과 조회가 죽은 것은 전혀 다른 사실인데, 사용자에겐 똑같이
   "없다"로 보인다. 실패는 던져서 호출부(app/auctions/page.tsx)가 "지금
   불러오지 못했다"고 말하게 한다. 사실 우선 — 실패를 데이터 없음으로 덮지 않는다. */
/**
 * [1028] 오늘(한국 시간) 0시를 bid_end 와 같은 꼴("YYYYMMDDHHMM")로 — 입찰 마감 하한.
 * bid_end 는 온비드 원문 12자리 숫자 문자열이라 사전순 비교가 곧 시간순이다(운영 8,351행 전부 12자리 · 2026-10-03 실측).
 * isPastBidEnd 와 같은 기준(마감 **날짜**가 오늘보다 앞이면 지난 것)이다.
 */
export function bidEndFloor(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}${p2(kst.getUTCMonth() + 1)}${p2(kst.getUTCDate())}0000`;
}

/** 최근 마감 물건을 몇 건까지 같이 읽는가 — 화면의 "지난 공고" 접힘(8건)과 같은 수 */
export const RECENT_CLOSED_LIMIT = 8;

/** 목록과 건수가 같이 쓰는 조건 — 용도 · 시군구 · 시도 */
export type AuctionFilterOpts = {
  usage?: string;
  sigungu?: string;
  /** [1028] 시도 원문("대전광역시") — 시군구 이름이 도시마다 겹친다(동구 4곳 · 중구 5곳 · 강서구 2곳 — 2026-10-03 운영) */
  sido?: string;
};

/** 조건 한 걸음 — PostgREST 빌더에 그대로 옮겨 적는다(빌더 타입이 조회마다 달라 걸음만 공유한다) */
type AuctionFilterStep =
  | { kind: "eq"; column: string; value: string }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "or"; filters: string };

/** 지역·용도 조건 — 진행 목록 · 지난 목록 · 건수에 똑같이 건다(셋이 다른 조건을 보면 숫자가 어긋난다) */
export function auctionFilterSteps(opts: AuctionFilterOpts): AuctionFilterStep[] {
  const steps: AuctionFilterStep[] = [];
  if (opts.sido?.trim()) steps.push({ kind: "eq", column: "sido", value: opts.sido.trim() });
  if (opts.sigungu) {
    /* [941] 수도권 확대 대응 — "성남시 분당구"처럼 공백이 든 이름은 원문
       표기(공백 유무)가 소스마다 다르다. 공백 그대로/제거 두 변형을 OR 로 건다.
       (값에 쉼표·괄호가 없는 한글 지명이라 PostgREST or 문법과 충돌하지 않는다) */
    const g = opts.sigungu.trim();
    const tight = g.replace(/\s+/g, "");
    steps.push(
      tight !== g
        ? { kind: "or", filters: `sigungu.ilike.%${g}%,sigungu.ilike.%${tight}%` }
        : { kind: "ilike", column: "sigungu", pattern: `%${g}%` },
    );
  }
  if (opts.usage) {
    const f = AUCTION_USAGE_FILTERS.find((x) => x.key === opts.usage);
    if (f) {
      /* [2026-08-22] 한 글자 키워드("전"·"답")를 %전% 부분일치로 걸면 "전시장"
         ·"운전학원"류 용도까지 토지로 잡힌다 — 한 글자는 정확일치(eq)로,
         두 글자 이상만 부분일치(ilike)로 건다. */
      const ors = f.match
        .map((m) =>
          m.length === 1
            ? `usage_scls.eq.${m},usage_mcls.eq.${m}`
            : `usage_scls.ilike.%${m}%,usage_mcls.ilike.%${m}%`,
        )
        .join(",");
      steps.push({ kind: "or", filters: ors });
    }
  }
  return steps;
}

export async function getAuctions(opts: AuctionFilterOpts & { limit?: number } = {}): Promise<AuctionItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 읽기 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  try {
    /* 지역·용도 조건은 진행 목록과 지난 목록에 똑같이 건다 */
    const steps = auctionFilterSteps(opts);
    const base = () => {
      let q = sb.from("onbid_auctions").select("*");
      for (const st of steps) {
        q = st.kind === "eq" ? q.eq(st.column, st.value) : st.kind === "ilike" ? q.ilike(st.column, st.pattern) : q.or(st.filters);
      }
      return q;
    };
    /* [1028] 마감이 지난 행이 상한을 먹지 않게 **오늘 이후 마감**부터 읽는다.
       예전에는 조건 없이 bid_end 오름차순 200건을 읽었다 — 지난 물건을 지우지 않으므로(삭제 금지) 지난 행이
       200건을 넘는 순간 화면의 진행·예정 목록이 통째로 비었다(2026-10-03 운영: 지난 219행 · 진행 8,132행인데 목록 0건).
       마감일을 모르는 행(null)은 "지난 것"으로 단정하지 않는다 — 진행 쪽에 남긴다(정렬상 맨 뒤).
       지난 공고 접힘(최근 마감 8건)은 따로 읽어 뒤에 붙인다 — 화면은 받은 목록을 날짜로 다시 가른다. */
    const floor = bidEndFloor();
    const [active, closed] = await Promise.all([
      base()
        .or(`bid_end.gte.${floor},bid_end.is.null`)
        .order("bid_end", { ascending: true, nullsFirst: false })
        .limit(opts.limit ?? 100),
      base().lt("bid_end", floor).order("bid_end", { ascending: false }).limit(RECENT_CLOSED_LIMIT),
    ]);
    if (active.error) throw new Error(active.error.message);
    if (!Array.isArray(active.data)) throw new Error("onbid_auctions 응답이 배열이 아닙니다");
    /* 지난 공고는 곁다리다 — 실패해도 진행 목록은 그대로 낸다 */
    const closedRows = !closed.error && Array.isArray(closed.data) ? closed.data : [];
    return [...active.data, ...closedRows].map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    logger.error("[getAuctions] 공매 물건 조회 실패", e);
    throw e;
  }
}

export async function getAuctionCount(): Promise<number> {
  const sb = getReadOnlySupabase();
  if (!sb) return 0;
  try {
    const { count, error } = await sb
      .from("onbid_auctions")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 입찰 중·예정(마감 전) 물건 수 — "입찰 중·예정 N건" 표기용.
 * [1028] 행을 받아 앱에서 세던 것을 DB 가 세게 바꿨다. 예전 방식은 `.limit(5000)` 을 걸어도 PostgREST 가
 * 1,000행에서 잘라 "1,000행 중 지나지 않은 것"만 셌다(운영 8,132건이 781건으로 나갔다 · 2026-10-03).
 * 기준은 목록과 같다(getAuctions — 마감 날짜가 오늘 이후이거나 마감일 미상).
 */
export async function getActiveAuctionCount(opts: AuctionFilterOpts = {}): Promise<number> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("Supabase 읽기 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  try {
    /* [1028] 조건(용도·시군구·시도)을 주면 그 조건의 진행·예정 건수 — 목록은 200건까지만 읽으므로 "현재 조건 N건"은 DB 가 센다 */
    let q = sb.from("onbid_auctions").select("id", { count: "exact", head: true });
    for (const st of auctionFilterSteps(opts)) {
      q = st.kind === "eq" ? q.eq(st.column, st.value) : st.kind === "ilike" ? q.ilike(st.column, st.pattern) : q.or(st.filters);
    }
    const { count, error } = await q.or(`bid_end.gte.${bidEndFloor()},bid_end.is.null`);
    if (error) throw new Error(error.message);
    if (typeof count !== "number") throw new Error("onbid_auctions 건수 응답이 숫자가 아닙니다");
    return count;
  } catch (e) {
    /* 0 을 돌려주면 "진행·예정 물건 0건 · 온비드 실데이터" 라고 단정하게 된다.
       실집계라고 써 놓은 자리라서, 실패를 0 으로 채우면 그 문장이 거짓이 된다. */
    logger.error("[getActiveAuctionCount] 진행 물건 수 집계 실패", e);
    throw e;
  }
}
