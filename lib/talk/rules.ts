/**
 * [1051 · 홈 실시간 토론] 지역(+단지) 한 줄 토론 — 순수 규칙(서버·클라이언트 공용 · 단위 시험 대상).
 *
 * 소유자 지시(2026-10-09): "홈 하단에 이런 실시간 토론을 할 수 있는 창"(네이버 증권 '오늘의 종목 토론 둘러보기').
 * 답: 단위 = 지역 + 단지 · 사람 글이 없으면 자동 소식 섞기(사람 글은 위) · 홈 창에서 바로 한 줄.
 *
 * 화면 = 왼쪽 지역 순위(탭: 토론 많은 · 상승 · 하락 · 거래량) + 오른쪽 고른 지역의 글.
 * 숫자는 이미 적재된 것만(한국부동산원 매매가격지수 전월비 · 한국부동산원 매매 거래량 · 이 표의 글 수) — 지어내지 않는다.
 */

export const TALK_MAX_LEN = 200;
export const TALK_MIN_LEN = 2;
/** 신고 누적 숨김 — 커뮤니티 글(CONTENT_REPORT_HIDE_THRESHOLD)과 같은 3건 */
export const TALK_REPORT_HIDE_THRESHOLD = 3;
/** 오른쪽 글 목록 새로 고침 간격(보이는 동안만) */
export const TALK_POLL_MS = 30_000;
/** 도배 상한 — 10분에 10줄(같은 글 24시간 금지는 커뮤니티 글 규칙 그대로) */
export const TALK_FLOOD_WINDOW_MS = 10 * 60_000;
export const TALK_FLOOD_MAX = 10;
/** "토론 많은" 탭이 세는 기간 */
export const TALK_HOT_DAYS = 7;

export type TalkTab = "hot" | "up" | "down" | "volume";
export const TALK_TABS: readonly { id: TalkTab; label: string }[] = [
  { id: "hot", label: "토론 많은" },
  { id: "up", label: "상승" },
  { id: "down", label: "하락" },
  { id: "volume", label: "거래량" },
];

/** 왼쪽 순위 한 줄 — /api/talk/board */
export type TalkBoardRegion = {
  id: string;
  /** 화면 이름("송파구" · "성남시 분당구") */
  name: string;
  /** 시·도 짧은 이름("서울" · "경기" · "인천") */
  sido: string;
  /** 실거래 지역 이름("서울 송파구" · "성남 분당구") — 단지 붙이기 검색 결과를 이 지역 것만 남길 때 */
  txName: string;
  /** 매매가격지수 전월 대비(%) — 없으면 null(모름) */
  pct: number | null;
  /** 지수 기준월(yyyymm) */
  indexYm: string | null;
  /** 아파트 매매 거래량(한국부동산원 월간 · 홈 지역 동향 카드와 같은 행) — 없으면 null */
  trades: number | null;
  tradesYm: string | null;
  /** 최근 TALK_HOT_DAYS 일 토론 글 수 */
  talks: number;
  /** 마지막 글 시각(ISO) — 없으면 null */
  lastTalkAt: string | null;
};

export type TalkBoard = {
  regions: TalkBoardRegion[];
  /** 지수 기준월 · 신고 건수 기준월(전체 공통) */
  indexYm: string | null;
  tradesYm: string | null;
  /** 최근 TALK_HOT_DAYS 일 글 합 */
  totalTalks: number;
};

/** 사람이 쓴 글 */
export type TalkPost = {
  kind: "talk";
  id: string;
  author: string;
  body: string;
  complexId: string | null;
  complexName: string | null;
  createdAt: string;
  /** 보는 사람 본인 글(지우기 단추) — 이메일은 내보내지 않는다 */
  mine?: boolean;
};

/** 자동 소식 — '소식' 표시를 붙여 사람 글 아래에 */
export type TalkFact = {
  kind: "fact";
  id: string;
  /** 지수 · 거래 · 뉴스 · 임장노트 */
  label: "지수" | "거래" | "뉴스" | "임장노트";
  text: string;
  href: string | null;
  /** 정렬·표시용 시각(ISO) — 지수·거래는 없음 */
  at: string | null;
  source: string | null;
  /** 지수 소식의 방향(색) */
  tone?: "up" | "down" | "flat";
};

export type TalkItem = TalkPost | TalkFact;

export type TalkFeed = {
  regionId: string;
  regionName: string;
  posts: TalkPost[];
  facts: TalkFact[];
};

/** 본문 다듬기 — 줄바꿈·연속 공백은 한 칸, 앞뒤 공백 제거 */
export function normalizeTalkBody(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type TalkBodyCheck = { ok: true; body: string } | { ok: false; reason: "empty" | "too_short" | "too_long" };

export function checkTalkBody(raw: unknown): TalkBodyCheck {
  const body = normalizeTalkBody(raw);
  if (!body) return { ok: false, reason: "empty" };
  if ([...body].length < TALK_MIN_LEN) return { ok: false, reason: "too_short" };
  if ([...body].length > TALK_MAX_LEN) return { ok: false, reason: "too_long" };
  return { ok: true, body };
}

export function talkBodyMessage(reason: "empty" | "too_short" | "too_long"): string {
  if (reason === "too_long") return `한 줄은 ${TALK_MAX_LEN}자까지`;
  return `${TALK_MIN_LEN}자 이상`;
}

/** 표시 이름 — 커뮤니티 글·노트 댓글과 같은 마스킹(이름이 없으면 이메일 앞 두 글자 + "** 이웃") */
export function talkAuthorLabel(name: string | null | undefined, email: string): string {
  const n = String(name ?? "").trim();
  if (n) return n.slice(0, 40);
  return `${email.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`;
}

/**
 * 탭별 순위. 값이 없는 지역은 그 탭에서 뺀다(상승·하락·거래량) — "모름"을 0 으로 세우지 않는다.
 * 토론 많은: 글 수 → 마지막 글 시각. 글이 하나도 없으면 빈 목록(화면이 "최근 7일 토론글 없음").
 */
export function rankTalkBoard(regions: readonly TalkBoardRegion[], tab: TalkTab): TalkBoardRegion[] {
  const list = [...regions];
  if (tab === "hot") {
    return list
      .filter((r) => r.talks > 0)
      .sort((a, b) => b.talks - a.talks || String(b.lastTalkAt ?? "").localeCompare(String(a.lastTalkAt ?? "")));
  }
  if (tab === "up") {
    return list.filter((r) => r.pct !== null && r.pct > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  }
  if (tab === "down") {
    return list.filter((r) => r.pct !== null && r.pct < 0).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  }
  return list.filter((r) => r.trades !== null && r.trades > 0).sort((a, b) => (b.trades ?? 0) - (a.trades ?? 0));
}

/** 처음 고를 탭 — 글이 있으면 토론 많은, 없으면 상승(상승이 비면 거래량) */
export function defaultTalkTab(board: TalkBoard): TalkTab {
  if (board.totalTalks > 0) return "hot";
  if (rankTalkBoard(board.regions, "up").length > 0) return "up";
  return "volume";
}

/** 사람 글(최신 순) 위 · 자동 소식 아래. 같은 id 는 한 번만 */
export function mergeTalkFeed(posts: readonly TalkPost[], facts: readonly TalkFact[]): TalkItem[] {
  const seen = new Set<string>();
  const out: TalkItem[] = [];
  const sortedPosts = [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const p of sortedPosts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  for (const f of facts) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

/** 새 글 받기 — 이미 가진 목록에 서버 목록을 합친다(지운 글은 서버 목록에 없으면 빠진다) */
export function mergeIncomingPosts(current: readonly TalkPost[], incoming: readonly TalkPost[]): TalkPost[] {
  const byId = new Map<string, TalkPost>();
  for (const p of incoming) byId.set(p.id, p);
  /* 방금 내가 올린 글이 아직 서버 목록에 안 잡혔으면(복제 지연) 1분은 붙들어 둔다 */
  const now = Date.now();
  for (const p of current) {
    if (byId.has(p.id)) continue;
    if (p.mine && now - Date.parse(p.createdAt) < 60_000) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** "+2.28%" · "−0.42%" · "0.00%" */
export function signedPct(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}%`;
}

/** "202608" → "8월" */
export function ymMonthLabel(ym: string | null | undefined): string {
  const m = /^(\d{4})(\d{2})$/.exec(String(ym ?? ""));
  return m ? `${Number(m[2])}월` : "";
}

/** 방금 · N분 전 · N시간 전 · N일 전 · M.D */
export function talkTimeLabel(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, nowMs - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const k = new Date(t + 9 * 3_600_000);
  return `${k.getUTCMonth() + 1}.${k.getUTCDate()}`;
}

/* [1052] 시·도 짧은 이름 — "서울특별시"·"경기도"·"부산광역시"도 짧은 이름으로 */
const SIDO_SHORT = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const SIDO_LONG: Record<string, string> = {
  충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북", 전라남도: "전남",
  경상북도: "경북", 경상남도: "경남", 강원도: "강원", 강원특별자치도: "강원", 제주도: "제주", 제주특별자치도: "제주",
};

/** 첫 낱말이 시·도면 짧은 이름, 아니면 null("오산시"·"분당구"처럼 시·도 없이 시작) */
export function talkSidoOf(regionText: string | null | undefined): string | null {
  const first = String(regionText ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  if (SIDO_LONG[first]) return SIDO_LONG[first];
  for (const s of SIDO_SHORT) {
    /* "광주시"는 경기 광주시라 시·도가 아니다 — 맨 "시"는 "서울시"만 */
    if (first === s || (first === "서울시" && s === "서울") || (first.startsWith(s) && /^(?:특별시|광역시|특별자치시|도)$/.test(first.slice(s.length)))) return s;
  }
  return null;
}

/** 단지 붙이기 검색 결과가 이 지역 단지인가 — 실거래 지역 이름이 같거나("서울 송파구"), 같은 구 이름으로 끝난다.
 *  [1052] 둘 다 시·도가 적혀 있으면 시·도도 같아야 — "부산 강서구" ≠ "서울 강서구"(긴 구 이름도 겹친다) */
export function complexInRegion(complexRegion: string | null | undefined, txName: string): boolean {
  const a = String(complexRegion ?? "").replace(/\s+/g, " ").trim();
  const b = String(txName ?? "").replace(/\s+/g, " ").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const sa = talkSidoOf(a);
  const sb = talkSidoOf(b);
  if (sa && sb && sa !== sb) return false;
  const tail = b.split(" ").slice(-1)[0] ?? "";
  /* "중구"·"서구"·"남구"처럼 짧은 구는 시·도까지 같아야 — 서울 중구 ≠ 부산 중구 */
  if (tail.length <= 2) return a === b;
  return a.endsWith(` ${tail}`) || a === tail;
}

/* ── [1052] 판 손질 — 순수 규칙(단위 시험) ───────────────────────────── */

/** 지역 찾기 — "송파" · "분당" · "경기 수원" · "인천" 모두. 공백·대소문자 무시 */
export function filterTalkRegions(regions: readonly TalkBoardRegion[], q: string): TalkBoardRegion[] {
  const needle = String(q ?? "").replace(/\s+/g, "").toLowerCase();
  if (!needle) return [...regions];
  return regions.filter((r) => {
    const hay = `${r.sido}${r.name}${r.txName}`.replace(/\s+/g, "").toLowerCase();
    return hay.includes(needle);
  });
}

/** 입력 자르기 — 글자(코드 포인트) 기준. UTF-16 단위로 자르면 이모지·한자 확장이 반쪽으로 남는다 */
export function clipTalkInput(v: string): string {
  const cps = [...String(v ?? "")];
  return cps.length > TALK_MAX_LEN ? cps.slice(0, TALK_MAX_LEN).join("") : String(v ?? "");
}

/** 남은 글자 표시 — 180자부터 경고, 200자에서 끝 */
export const TALK_WARN_LEN = 180;
export function talkCountTone(len: number): "ok" | "warn" | "full" {
  if (len >= TALK_MAX_LEN) return "full";
  if (len >= TALK_WARN_LEN) return "warn";
  return "ok";
}

/** 새로 받은 글 중 처음 보는 글 수(내 글 제외) — "새 글 N개" 알림 */
export function countFreshPosts(seen: ReadonlySet<string>, incoming: readonly TalkPost[]): number {
  return incoming.filter((p) => !p.mine && !seen.has(p.id)).length;
}

/** 올린 직후 왼쪽 순위의 글 수를 바로 +1(판 응답은 CDN 30초 캐시라 다시 받아도 늦다) */
export function bumpBoardTalk(board: TalkBoard, regionId: string, atIso: string): TalkBoard {
  let hit = false;
  const regions = board.regions.map((r) => {
    if (r.id !== regionId) return r;
    hit = true;
    return { ...r, talks: r.talks + 1, lastTalkAt: atIso };
  });
  return hit ? { ...board, regions, totalTalks: board.totalTalks + 1 } : board;
}

/** 마지막으로 본 지역(홈·토론 화면 공용 · 이 브라우저에만) */
export const TALK_LAST_REGION_KEY = "talk:last-region";
