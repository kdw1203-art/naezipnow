/**
 * 동네이야기 카테고리 바로가기 — 단일 소스.
 *
 * 예전에는 이 배열이 `app/town/page.tsx` 안에만 있었다. 그래서 랜딩(`/town`)에서는
 * 카테고리가 보이는데, 정작 카테고리 안으로 들어가면(`/town/groups` 등) 목록이
 * 사라져서 다른 카테고리로 넘어가려면 뒤로가기를 해야 했다.
 * 배열을 여기로 올려 하위 페이지 9곳이 같은 목록을 그대로 쓰게 한다.
 *
 * 주의: `/apply`·`/supply`·`/auctions` 는 `app/town/` 밖에 있으므로
 * 이 모듈은 서버·클라이언트 어디서든 import 가능해야 한다("use client" 금지).
 */

export type TownCategoryLink = {
  href: string;
  label: string;
  /**
   * [v4] 짧은 이름 — /town 맨 아래 "동네 자료 — 뉴스룸 · 청약 · 공매 · 입주 · 정비사업" 한 줄에 쓴다.
   * 한 줄에 다섯 칸이 390px 안에 들어가야 해서 label("청약 센터")의 앞 토막만. 없으면 label.
   */
  short?: string;
  /** 선형 아이콘 이름(app/components/Icon.tsx) — [959] 이모지 식별자를 이름으로 바꿨다.
   *  이모지는 EMOJI_MAP 을 거쳐 그려지긴 했지만 매핑이 없는 글자는 기기 폰트로 떨어졌다. */
  icon: string;
  /**
   * 카드 부제. [1012] 규칙 6·7 — **숫자만** 적는다("오늘 기사 4건"). 예전의 "기사 요약 · 자동 수집",
   * "분양·경쟁률" 같은 내부 설명은 뺐다(기준 사이트의 입구 카드는 이름 + 건수뿐이다).
   * 카탈로그에는 빈 문자열을 두고, 화면(app/town/page.tsx)이 손에 든 실데이터로 채운다.
   * 비어 있으면 카드에 부제를 그리지 않는다 — 없는 숫자를 지어내지 않는다.
   */
  desc: string;
  /**
   * 아이콘 칩 색. [1012] 규칙 9 — 예전엔 성격별 3색(파랑·초록·주황)이었다. 색 3종을 나열한 카드 줄은
   * "AI 가 만든 사이트" 신호 5번(아이콘 나열)이라 **연한 회색 한 가지**(bg-bg + 잉크 글자)로 통일했다.
   * 필드는 호환을 위해 남긴다(TownPageHead 도 쓴다). raw hex 금지 — 토큰 클래스만.
   */
  tone: string;
  /** 데이터가 사람 손에서 나오는 칸(전문가·모임·자료) — 비어 있을 수 있어 화면이 "모집 중"을 말한다 */
  humanSupplied?: boolean;
  /**
   * 하위 페이지 머리(TownHero · TownPageHead)의 한 줄.
   *
   * [974] 여기로 올린 이유: 같은 문장이 **페이지 본문과 로딩 스켈레톤 두 곳에**
   * 따로 적혀 있어서 서로 어긋났다. 실제로 /qna 는 로딩 중에는 "홈 › 동네이야기 ›
   * 단지 Q&A" + 제목이 카테고리 줄 **위**에 뜨고(옛 패턴), 로딩이 끝나면 새 패턴으로
   * 갈아끼워졌다 — 소유자가 캡처한 화면이 바로 그 로딩 상태다. /supply 는 한술 더
   * 떠 로딩 중 브레드크럼이 "홈 › 시장 › 입주 예정 물량" 이었다(카테고리 이름조차
   * 달랐다). /auctions 는 "공매·경매" 였다.
   *
   * 문장을 이 목록 한 곳에 두면 두 화면이 어긋날 자리가 없어진다.
   * 문체 규칙은 app/town/TownPageHead.tsx 주석에 있다 — 명사형 "대상 — 출처·구성".
   * [1012] 규칙 6 — 출처·시점이 드러나는 명사형만. 권유·슬로건 금지.
   */
  headSub: string;
  /**
   * [978] 하위 페이지 히어로의 제목 세 토막 — **[1012] 에서 렌더를 끊었다.**
   * "이번 달 청약, 경쟁률까지 보고 정합니다" 같은 문장은 기준 사이트 4곳 어디에도 없는
   * 슬로건(AI 신호 4번)이라 TownHero 는 이제 카테고리 이름을 h1 로 쓰고 이 값은 읽지 않는다.
   * 필드는 다음 릴리스에서 지운다(타입만 남김 — 옛 데이터 형태 호환).
   */
  heroTitle?: readonly [string, string, string];
  /** [978] 히어로 아이콘 칩의 글자색 — 네이비 위 고정색(globals.css --on-navy-*). */
  heroTone: string;
  /**
   * [978] 히어로 오른쪽 버튼. **이 카테고리에서 할 일 하나**만 둔다.
   * 없으면 빈 배열 — 없는 버튼을 지어내지 않는다. 옆 카테고리로 보내는 링크도
   * 넣지 않는다(그 이동은 바로 아래 카테고리 줄이 이미 한다 — TownPageHead 주석).
   * 클라이언트 조각이 필요한 칸(모임 만들기)은 페이지가 action 으로 덮어쓴다.
   * [1012] 규칙 5 — 라벨은 동사+대상("청약 캘린더 보기").
   */
  heroCta: readonly { label: string; href: string; primary?: boolean }[];
  /**
   * [1006] 이 칸이 **다른 재질**(뉴스룸)로 가는 입구인가. 카테고리 카드가 이 값을 보고
   * 한지 면·네이비 아이콘(globals.css .news-entry-card)으로 그린다 — 나머지 넷(공공데이터)과
   * 같은 흰 카드로 서 있으면 "뉴스도 동네이야기의 한 칸"으로 읽힌다. 뉴스룸은 히어로도
   * 목록도 다른 화면이므로 입구부터 다르게 보여야 한다.
   */
  entry?: "newsroom";
};

/** 브레드크럼 한 줄 — 9칸 전부 "동네이야기 › {라벨}". 로딩 스켈레톤도 이걸 쓴다. */
export function townBreadcrumb(href: string): string {
  const l = TOWN_CATEGORY_LINKS.find((x) => x.href === href);
  return l ? `동네이야기 › ${l.label}` : "동네이야기";
}

/* [959] 순서: **지금 실제로 내용이 있는 칸이 앞**. 2026-09-03 실측 — 뉴스 400+ ·
   청약(청약홈 공공데이터) · 공매 1,130건 · 입주 물량 675행 · 정비사업 지도 = 실데이터,
   전문가 0 · 임장 모임 0 · 리포트 0 = 사람이 채워야 하는 칸. 예전(2026-08-22)엔
   "방문 실측 빈도순"으로 전문가가 1번이었는데, 1번이라서 많이 눌린 것과 내용이 있어
   눌린 것을 구분할 수 없었고 누르면 빈 화면이었다. Q&A·전문가는 그래도 두 번째 줄
   첫머리에 둔다 — 질문·상담은 비어 있어도 시작점이 되기 때문이다. */
/* [992 · A1] Q&A·전문가·모임·자료 네 칸을 뺐다 — 보관(비노출) 영역(lib/seo/archived-routes.ts).
   남은 다섯 칸은 전부 공공데이터·뉴스(사람이 채우지 않아도 비지 않는 칸)다. */
/* [1012] 아이콘 칩 한 가지 색(규칙 9) — 카드·머리 모두 이 값을 쓴다 */
const TONE = "bg-bg text-text-2";

export const TOWN_CATEGORY_LINKS: TownCategoryLink[] = [
  /* [1011] 동네이야기(허브) 자신을 첫 칸으로 넣는다(소유자 지시 — "동네이야기가 하단 카드에 없어").
     예전에는 허브만 빠져 있어서 ① GNB 드롭다운(동네이야기·뉴스룸·청약·정비사업)과 카드 줄의
     구성이 서로 달랐고 ② 뉴스룸·청약 같은 하위 화면에서 이 줄만 보고는 허브로 돌아갈 칸이
     없었다(빵부스러기를 찾아야 했다). 지금 보고 있는 화면의 칸은 링크가 아니라 고정 표식으로
     그려지므로(TownCategoryNav 의 aria-current), /town 에서 자기 자신을 누르는 일은 없다. */
  /* [1012] desc 는 전부 "" — 숫자는 화면이 실데이터로 채운다(app/town/page.tsx categoryItems). */
  { href: "/town", label: "동네이야기", icon: "messages-square", desc: "", tone: TONE, headSub: "이웃 글 · 공개 임장노트 — 지역별 최신순", heroTone: "text-on-navy-amber", heroCta: [] },
  /* 모바일 실측(2026-08-02): "뉴스·다이제스트"는 카드 폭(104px)에서 "뉴스·다이제…"
     로 잘렸다. 라벨은 짧게, 다이제스트는 부제로. */
  /* [1006] 뉴스 칸은 뉴스룸(/town/news)으로 가는 **입구**다 — entry: "newsroom". */
  /* [1007 · P2] 라벨 "뉴스" → "뉴스룸": 카드·GNB·하위 화면("뉴스룸 전체 ›")이 같은 이름으로
     같은 곳(/town/news)을 가리킨다. 이야기와 다른 재질의 **장소** 이름이라 "뉴스"보다 분명하다. */
  { href: "/town/news", label: "뉴스룸", short: "뉴스룸", icon: "newspaper", desc: "", tone: TONE, headSub: "부동산 기사 — 매일 아침 8시 수집 · 출처·발행 시각 표기", heroTone: "text-on-navy-amber", heroCta: [{ label: "주간 다이제스트 보기", href: "/digest" }], entry: "newsroom" },
  { href: "/apply", label: "청약 센터", short: "청약", icon: "ticket", desc: "", tone: TONE, headSub: "청약홈(한국부동산원) 공공데이터 — 경쟁률·특별공급·접수 일정", heroTone: "text-on-navy-green", heroCta: [{ label: "청약 캘린더 보기", href: "/apply/calendar" }] },
  { href: "/auctions", label: "공매 물건", short: "공매", icon: "hammer", desc: "", tone: TONE, headSub: "온비드 진행·예정 물건 — 감정가·최저입찰가·입찰일", heroTone: "text-on-navy-green", heroCta: [] },
  { href: "/supply", label: "입주 물량", short: "입주", icon: "construction", desc: "", tone: TONE, headSub: "지역·시기별 아파트 입주 예정 — 청약홈 공고 기준", heroTone: "text-on-navy-green", heroCta: [] },
  { href: "/redevelopment", label: "정비사업 지도", short: "정비사업", icon: "map", desc: "", tone: TONE, headSub: "재개발·재건축·소규모 정비사업 — 사업종류별 마커", heroTone: "text-on-navy-green", heroCta: [] },
];
