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
  /** 선형 아이콘 이름(app/components/Icon.tsx) — [959] 이모지 식별자를 이름으로 바꿨다.
   *  이모지는 EMOJI_MAP 을 거쳐 그려지긴 했지만 매핑이 없는 글자는 기기 폰트로 떨어졌다. */
  icon: string;
  desc: string;
  /** 아이콘 칩 색 — 9칸이 전부 같은 잉크색이라 목록이 눈에 안 들어왔다.
   *  성격이 비슷한 것끼리 색을 묶는다(사람=파랑 / 공급·분양=초록 /
   *  글·자료=주황). raw hex 금지 — 토큰 클래스만. */
  tone: string;
  /** 데이터가 사람 손에서 나오는 칸(전문가·모임·자료) — 비어 있을 수 있어 화면이 "모집 중"을 말한다 */
  humanSupplied?: boolean;
  /**
   * 하위 페이지 머리(TownPageHead)의 한 줄.
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
   */
  headSub: string;
  /**
   * [978] 하위 페이지 히어로의 제목 — [앞, 강조, 뒤] 세 토막.
   *
   * 동네이야기 홈이 "다녀온 사람의 기록이 **지금** 동네를 말합니다" 인 것과 같은
   * 모양이다. 강조 한 단어만 주홍(--brand-red-on-dark)으로 뜬다. 문자열 안에
   * 마크업을 넣어 파싱하지 않고 세 토막으로 받는 이유는, 파싱 규칙이 생기면
   * 번역·수정할 때마다 그 규칙을 기억해야 하기 때문이다.
   *
   * 문체: 홈과 같은 **평서형 한 문장**. headSub(명사형 요약)와 역할이 다르다 —
   * 제목은 "여기서 무엇을 할 수 있는가", headSub 은 "무엇을 보는 곳인가".
   */
  heroTitle: readonly [string, string, string];
  /** [978] 히어로 아이콘 칩의 글자색 — 네이비 위 고정색(globals.css --on-navy-*). */
  heroTone: string;
  /**
   * [978] 히어로 오른쪽 버튼. **이 카테고리에서 할 일 하나**만 둔다.
   * 없으면 빈 배열 — 없는 버튼을 지어내지 않는다. 옆 카테고리로 보내는 링크도
   * 넣지 않는다(그 이동은 바로 아래 카테고리 줄이 이미 한다 — TownPageHead 주석).
   * 클라이언트 조각이 필요한 칸(모임 만들기)은 페이지가 action 으로 덮어쓴다.
   */
  heroCta: readonly { label: string; href: string; primary?: boolean }[];
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
export const TOWN_CATEGORY_LINKS: TownCategoryLink[] = [
  /* 모바일 실측(2026-08-02): "뉴스·다이제스트"는 카드 폭(104px)에서 "뉴스·다이제…"
     로 잘렸다. 라벨은 짧게, 다이제스트는 부제로. */
  { href: "/town/news", label: "뉴스", icon: "newspaper", desc: "요약·주간 다이제스트", tone: "bg-warning-soft text-warning", headSub: "매일 아침 모은 부동산 기사 요약 — 주간 다이제스트 포함", heroTitle: ["오늘 부동산은 ", "이렇게", " 움직였습니다"], heroTone: "text-on-navy-amber", heroCta: [{ label: "주간 다이제스트", href: "/digest" }] },
  { href: "/apply", label: "청약 센터", icon: "ticket", desc: "분양·경쟁률", tone: "bg-success-soft text-success", headSub: "청약홈 공공데이터 — 경쟁률·특별공급·접수 일정", heroTitle: ["이번 달 청약, ", "경쟁률", "까지 보고 정합니다"], heroTone: "text-on-navy-green", heroCta: [{ label: "청약 캘린더", href: "/apply/calendar" }] },
  { href: "/auctions", label: "공매 물건", icon: "hammer", desc: "온비드 공매", tone: "bg-success-soft text-success", headSub: "온비드 진행·예정 물건 — 감정가·최저입찰가·입찰일", heroTitle: ["감정가보다 싼 물건이 ", "지금", " 입찰 중입니다"], heroTone: "text-on-navy-green", heroCta: [] },
  { href: "/supply", label: "입주 물량", icon: "construction", desc: "공급 일정", tone: "bg-success-soft text-success", headSub: "지역·시기별 아파트 입주 예정 — 청약홈 공고 기준", heroTitle: ["언제 어디에 ", "얼마나", " 들어오는지 봅니다"], heroTone: "text-on-navy-green", heroCta: [] },
  { href: "/redevelopment", label: "정비사업 지도", icon: "map", desc: "재개발·재건축", tone: "bg-success-soft text-success", headSub: "재개발·재건축·소규모 정비사업 — 사업종류별 컬러 마커", heroTitle: ["우리 동네 재개발이 ", "어디까지", " 왔는지 봅니다"], heroTone: "text-on-navy-green", heroCta: [] },
  { href: "/qna", label: "단지 Q&A", icon: "messages-square", desc: "묻고 답하기", tone: "bg-primary-soft text-primary", headSub: "단지·동네 궁금증과 이웃·실거주자의 답 — 주제별 모아보기", heroTitle: ["살아 본 사람만 아는 답이 ", "여기", " 있습니다"], heroTone: "text-on-navy-blue", heroCta: [] },
  { href: "/town/experts", label: "전문가", icon: "graduation", desc: "상담·견적", tone: "bg-primary-soft text-primary", humanSupplied: true, headSub: "자격을 확인한 전문가 상담 — 글 문의·견적 요청", heroTitle: ["자격을 확인한 전문가에게 ", "직접", " 묻습니다"], heroTone: "text-on-navy-blue", heroCta: [{ label: "전문가로 참여", href: "/town/experts/join" }] },
  { href: "/town/groups", label: "임장 모임", icon: "compass", desc: "함께 임장", tone: "bg-primary-soft text-primary", humanSupplied: true, headSub: "같은 단지를 함께 도는 이웃 모집 — 참여 확정 시 채팅방", heroTitle: ["같은 단지를 ", "함께", " 도는 이웃을 찾습니다"], heroTone: "text-on-navy-blue", heroCta: [] },
  { href: "/town/library", label: "자료", icon: "folder", desc: "리포트·노트", tone: "bg-warning-soft text-warning", humanSupplied: true, headSub: "리포트와 이웃들의 공개 임장노트 — 한곳에서 열람", heroTitle: ["남이 다녀온 기록이 ", "내", " 임장을 줄입니다"], heroTone: "text-on-navy-amber", heroCta: [{ label: "임장노트 쓰기", href: "/notes/new" }] },
];
