/**
 * [1008 · J] 계약·잔금 일정표 — 항목 목록·기한 계산·캘린더(.ics) 만들기(순수 — 같은 폴더의 dates·holidays 만 쓴다).
 *
 * 왜(실측): /guides/contract 30일 조회 0 — 정적 글 한 장으로는 "내 계약일 기준으로 언제까지 뭘"이
 * 나오지 않는다. 계약일·잔금일만 넣으면 날짜가 붙은 할 일 목록이 되게 한다(서버 호출 없음).
 *
 * ── 법정 기한 원문 확인(확인일 2026-09-21, 국가법령정보센터 law.go.kr 현행 조문) ─────────────────
 *  · 부동산 거래신고 등에 관한 법률 제3조①③ [시행 2024.5.17. 법률 제20194호] — 거래계약 체결일부터 30일 이내
 *    공동 신고, 개업공인중개사가 거래계약서를 작성·교부했으면 중개사가 신고. 제28조②1호 — 미신고 과태료.
 *  · 같은 법 제11조①⑥ — 허가구역 토지거래계약은 체결하려는 당사자가 허가를 받아야 하고, 허가 없는 계약은
 *    효력이 없다. 같은 법 시행령 제14조②1호 [시행 2026.5.29. 대통령령 제36365호] — 거주용 허가는 취득일부터 2년 이용.
 *  · 부동산등기 특별조치법 제2조①1호 [시행 2022.1.1. 법률 제18655호] — 반대급부 이행 완료일(잔금일)부터 60일 이내
 *    소유권이전등기 신청. 제11조 — 신청 해태 과태료.
 *  · 지방세법 제20조①④ [시행 2026.7.1. 법률 제21308호] — 취득일부터 60일 이내 신고·납부, 그 안에 등기하려면
 *    등기 신청서 접수일까지. 지방세법 시행령 제20조②⑭ [시행 2026.9.18. 대통령령 제36586호] — 유상승계취득일은
 *    사실상의 잔금지급일, 그 전에 등기하면 등기일. 지방세기본법 제53조·제55조 [시행 2026.2.5.] — 무신고·납부지연 가산세.
 *  · 주민등록법 제16조① [시행 2025.7.22. 법률 제20677호] — 신거주지에 전입한 날부터 14일 이내 전입신고. 제40조④ 과태료.
 *  · 공인중개사법 제17조·제25조③·제30조③⑤ [시행 2026.8.28. 법률 제21409호] — 등록증 게시, 확인·설명서 교부,
 *    손해배상책임 보장(보증보험·공제·공탁) 증서 사본 교부.
 *  · 민법 제565조 [시행 2026.3.17.] — 이행에 착수할 때까지 계약금 포기·배액 상환으로 해제. 제157조 — 기간의 첫날 불산입.
 *  · 마지막 날이 토·일·공휴일이면 다음 평일 — 민법 제161조(행정 기한은 행정기본법 제6조①이 준용)·지방세기본법 제24조①.
 *    공휴일 목록·근거는 lib/journey/holidays.ts(2026·2027 월력요항, 그 밖의 해는 토·일만). [리뷰 C]
 *  · 규제지역·허가구역 범위: 정책브리핑 2025-10-15 「주택시장 안정화 대책」(서울 전역·경기 12곳 투기과열지구·조정대상지역·
 *    토지거래허가구역, 2025-10-20 효력) · 자금조달계획서: 정책브리핑 2020-10(규제지역은 가격과 관계없이 제출, 2020-10-27 시행).
 * 확인되지 않는 내용(대출 한도 수치 등)은 적지 않는다 — 대출·세금 계산은 /calculator 가 맡는다.
 * 법무사·변호사 연결·추천은 하지 않는다(등기는 "신청" 사실만).
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

import { addDays, daysBetween, formatKoreanDay } from "./dates";
import { holidayName, nextWorkday } from "./holidays";

/** 법령 원문을 마지막으로 확인한 날 — 화면 고지에 그대로 쓴다 */
export const LAW_CHECKED_ON = "2026-09-21";

export type ContractAnchor = "contract" | "mid" | "balance" | "moveIn";
export type ContractPhase =
  | "before"
  | "contractDay"
  | "report"
  | "mid"
  | "preBalance"
  | "balanceDay"
  | "afterBalance"
  | "moveIn";

export type RefLink = { label: string; href: string };

export type ContractItem = {
  id: string;
  phase: ContractPhase;
  title: string;
  desc: string;
  /** 법이 정한 기한(넘기면 과태료·가산세) */
  legal?: boolean;
  /** 법이 정한 선행 조건(기한은 아니지만 어기면 계약 효력 문제) */
  required?: boolean;
  laws?: readonly RefLink[];
  /** 공식 누리집(정부·공공) */
  links?: readonly RefLink[];
  /** 우리 화면 */
  more?: RefLink;
};

export type PhaseMeta = {
  title: string;
  anchor: ContractAnchor;
  offsetDays: number;
  /** 기한 설명 — "계약일부터 30일 이내" */
  dueText: string;
  /** 법정 기한인가 */
  legal: boolean;
  /** 권장 시점인가(법정 아님) */
  suggested?: boolean;
  /** 캘린더 제목 */
  calendarTitle: string;
};

/** 국가법령정보센터 조문 링크(한글 경로 그대로 — 인쇄할 때 주소가 읽힌다) */
export function lawHref(lawName: string, article: string): string {
  return `https://www.law.go.kr/법령/${lawName}/${article}`;
}

const LAW = {
  report: { label: "부동산 거래신고 등에 관한 법률 제3조", href: lawHref("부동산거래신고등에관한법률", "제3조") },
  reportFine: { label: "같은 법 제28조(과태료)", href: lawHref("부동산거래신고등에관한법률", "제28조") },
  permit: { label: "부동산 거래신고 등에 관한 법률 제11조", href: lawHref("부동산거래신고등에관한법률", "제11조") },
  permitUse: { label: "같은 법 시행령 제14조", href: lawHref("부동산거래신고등에관한법률시행령", "제14조") },
  registration: { label: "부동산등기 특별조치법 제2조", href: lawHref("부동산등기특별조치법", "제2조") },
  registrationFine: { label: "같은 법 제11조(과태료)", href: lawHref("부동산등기특별조치법", "제11조") },
  acqTax: { label: "지방세법 제20조", href: lawHref("지방세법", "제20조") },
  acqDate: { label: "지방세법 시행령 제20조", href: lawHref("지방세법시행령", "제20조") },
  acqLateFile: { label: "지방세기본법 제53조(가산세)", href: lawHref("지방세기본법", "제53조") },
  moveIn: { label: "주민등록법 제16조", href: lawHref("주민등록법", "제16조") },
  moveInFine: { label: "같은 법 제40조(과태료)", href: lawHref("주민등록법", "제40조") },
  brokerSign: { label: "공인중개사법 제17조", href: lawHref("공인중개사법", "제17조") },
  brokerExplain: { label: "공인중개사법 제25조", href: lawHref("공인중개사법", "제25조") },
  brokerBond: { label: "공인중개사법 제30조", href: lawHref("공인중개사법", "제30조") },
  deposit: { label: "민법 제565조", href: lawHref("민법", "제565조") },
} as const;

const SITE = {
  iros: { label: "인터넷등기소", href: "https://www.iros.go.kr" },
  gov24: { label: "정부24", href: "https://www.gov.kr" },
  eum: { label: "토지이음(주소로 허가구역 확인)", href: "https://www.eum.go.kr" },
  nsdi: { label: "국가공간정보포털 ‘부동산중개업 조회’", href: "https://www.nsdi.go.kr" },
  rtms: { label: "부동산거래관리시스템", href: "https://rtms.molit.go.kr" },
  wetax: { label: "위택스", href: "https://www.wetax.go.kr" },
  policy1015: {
    label: "정책브리핑 2025-10-15 대책",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148950973",
  },
  fundingPlan: {
    label: "정책브리핑 · 자금조달계획서 기준",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148878932",
  },
} as const;

export const CONTRACT_PHASES: Record<ContractPhase, PhaseMeta> = {
  before: {
    title: "계약 전",
    anchor: "contract",
    offsetDays: 0,
    dueText: "계약하기 전에",
    legal: false,
    calendarTitle: "계약 전 확인",
  },
  contractDay: {
    title: "계약일",
    anchor: "contract",
    offsetDays: 0,
    dueText: "계약하는 날",
    legal: false,
    calendarTitle: "계약일",
  },
  report: {
    title: "부동산 거래신고",
    anchor: "contract",
    offsetDays: 30,
    dueText: "계약일부터 30일 이내",
    legal: true,
    calendarTitle: "부동산 거래신고 기한",
  },
  mid: {
    title: "중도금일",
    anchor: "mid",
    offsetDays: 0,
    dueText: "중도금 보내는 날",
    legal: false,
    calendarTitle: "중도금일",
  },
  preBalance: {
    title: "대출 신청·이사 준비",
    anchor: "balance",
    offsetDays: -30,
    dueText: "잔금 1~2개월 전(권장)",
    legal: false,
    suggested: true,
    calendarTitle: "대출 신청·이사 준비(권장)",
  },
  balanceDay: {
    title: "잔금일",
    anchor: "balance",
    offsetDays: 0,
    dueText: "잔금 치르는 날",
    legal: false,
    calendarTitle: "잔금일",
  },
  afterBalance: {
    title: "취득세·소유권이전등기",
    anchor: "balance",
    offsetDays: 60,
    dueText: "잔금일부터 60일 이내",
    legal: true,
    calendarTitle: "취득세·등기 신청 기한",
  },
  moveIn: {
    title: "전입신고",
    anchor: "moveIn",
    offsetDays: 14,
    dueText: "입주일부터 14일 이내",
    legal: true,
    calendarTitle: "전입신고 기한",
  },
};

/** 같은 날짜일 때의 순서 = 일이 일어나는 순서 */
export const PHASE_ORDER: readonly ContractPhase[] = [
  "before",
  "contractDay",
  "mid",
  "preBalance",
  "report",
  "balanceDay",
  "afterBalance",
  "moveIn",
];

export const CONTRACT_ITEMS: readonly ContractItem[] = [
  /* ── 계약 전 ── */
  {
    id: "pre-permit",
    phase: "before",
    title: "토지이용계획·토지거래허가구역 확인",
    desc:
      "토지이음에서 주소로 토지이용계획을 열면 허가구역인지 나와요. 허가구역이면 계약하기 전에 시·군·구청 허가를 받아야 하고, 허가 없이 맺은 계약은 효력이 없어요. 2026년 9월 기준 서울 전역과 경기 12곳의 아파트가 허가구역이에요(2025년 10월 20일부터). 거주용으로 허가받으면 취득일부터 2년 동안 직접 살아야 해요. 지정은 바뀔 수 있으니 주소로 꼭 확인하세요.",
    required: true,
    laws: [LAW.permit, LAW.permitUse],
    links: [SITE.eum, SITE.policy1015],
  },
  {
    id: "pre-registry",
    phase: "before",
    title: "등기부등본 떼어 보기",
    desc:
      "갑구에서 소유자와 가압류·가처분을, 을구에서 근저당 같은 빚을 확인해요. 등기부의 소유자가 계약할 사람과 같은지도 봐요.",
    links: [SITE.iros],
    more: { label: "등기부등본이란", href: "/glossary/deunggibu-deungbon" },
  },
  {
    id: "pre-building",
    phase: "before",
    title: "건축물대장 확인",
    desc: "‘위반건축물’ 표시가 있는지, 면적·용도가 실제와 같은지 봐요.",
    links: [SITE.gov24],
  },
  {
    id: "pre-broker",
    phase: "before",
    title: "중개사무소 등록·보증 확인",
    desc:
      "사무소에 걸린 중개사무소등록증과, 중개 사고가 나면 손해를 물어 주는 보증(공제·보증보험 등) 증서를 확인해요.",
    laws: [LAW.brokerSign, LAW.brokerBond],
    links: [SITE.nsdi],
  },
  {
    id: "pre-seller",
    phase: "before",
    title: "매도인 본인·대리권 확인",
    desc:
      "신분증의 이름이 등기부의 소유자와 같은지 봐요. 대리인이 나오면 위임장과 인감증명서를 확인하고, 소유자와 직접 통화해 두면 안전해요.",
  },
  {
    id: "pre-funds",
    phase: "before",
    title: "대출 한도·자금조달계획서 미리 확인",
    desc:
      "은행에서 대출 가능 금액과 금리를 미리 알아 두세요. 규제지역(2026년 9월 기준 서울 전역·경기 12곳) 주택은 가격과 관계없이 자금조달계획서를 내야 하고, 투기과열지구는 증빙서류도 함께 내요.",
    links: [SITE.fundingPlan],
    more: { label: "대출·필요 현금 계산", href: "/calculator" },
  },
  /* ── 계약일 ── */
  {
    id: "c-deposit",
    phase: "contractDay",
    title: "계약금은 소유자 명의 계좌로",
    desc: "등기부의 소유자 본인 이름으로 된 계좌인지 확인하고 보내요. 다른 사람 계좌라면 멈추고 이유를 확인하세요.",
  },
  {
    id: "c-terms",
    phase: "contractDay",
    title: "특약을 읽고 서명",
    desc: "잔금 전 근저당 말소, 하자 수리, 관리비 정산처럼 말로 한 약속이 계약서 특약에 적혔는지 확인해요.",
    more: { label: "자주 쓰는 특약 예시", href: "/guides/contract" },
  },
  {
    id: "c-papers",
    phase: "contractDay",
    title: "계약서·확인설명서·보증 증서 받기",
    desc: "계약서, 중개대상물 확인·설명서, 손해배상 보증 증서 사본을 받아 계약금 이체 내역과 함께 보관해요.",
    laws: [LAW.brokerExplain, LAW.brokerBond],
  },
  /* ── 거래신고(법정 30일) ── */
  {
    id: "r-report",
    phase: "report",
    title: "부동산 거래신고",
    desc:
      "중개사가 계약서를 썼다면 중개사가 신고해요 — 신고필증을 받았는지 확인하세요. 직거래라면 매도인·매수인이 함께 신고해요. 기한을 넘기면 과태료가 붙어요.",
    legal: true,
    laws: [LAW.report, LAW.reportFine],
    links: [SITE.rtms],
  },
  /* ── 중도금 ── */
  {
    id: "m-pay",
    phase: "mid",
    title: "중도금 보내기",
    desc:
      "계약금처럼 소유자 명의 계좌로 보내고 영수증을 받아요. 어느 한쪽이 중도금을 치르는 등 계약을 실행하기 시작하면, 계약금을 포기하거나 두 배로 돌려주는 방법으로는 계약을 없던 일로 하기 어려워져요.",
    laws: [LAW.deposit],
  },
  /* ── 잔금 1~2개월 전(권장) ── */
  {
    id: "pb-loan",
    phase: "preBalance",
    title: "주택담보대출 신청",
    desc: "잔금일에 돈이 나오도록 은행 심사 일정을 맞춰 신청해요. 필요한 서류는 은행에 확인하세요.",
    more: { label: "대출·필요 현금 계산", href: "/calculator" },
  },
  {
    id: "pb-move",
    phase: "preBalance",
    title: "이사·입주 준비",
    desc: "이삿짐 업체를 예약하고, 관리사무소에 이사 날짜(엘리베이터 사용)를 알려요.",
  },
  /* ── 잔금일 ── */
  {
    id: "b-registry",
    phase: "balanceDay",
    title: "잔금 직전 등기부 다시 떼기",
    desc: "계약 뒤에 새 근저당이나 가압류가 생기지 않았는지, 잔금을 보내기 직전에 확인해요.",
    links: [SITE.iros],
  },
  {
    id: "b-pay",
    phase: "balanceDay",
    title: "잔금 보내기·영수증 받기",
    desc:
      "소유자 명의 계좌로 보내요. 매도인의 대출(근저당)을 잔금으로 갚기로 했다면 상환 영수증과 말소 서류를 확인해요.",
    more: { label: "근저당권이란", href: "/glossary/geunjeodang" },
  },
  {
    id: "b-handover",
    phase: "balanceDay",
    title: "열쇠 받기·관리비·공과금 정산",
    desc: "열쇠와 현관 비밀번호를 받고, 관리비·전기·가스·수도 사용분을 잔금일 기준으로 나눠 정산해요.",
  },
  /* ── 잔금 뒤(법정 60일) ── */
  {
    id: "a-tax",
    phase: "afterBalance",
    title: "취득세 신고·납부",
    desc:
      "보통 잔금을 치른 날이 취득일이에요(그 전에 등기하면 등기일). 등기를 하려면 등기 신청 전에 취득세를 먼저 내야 해요. 늦으면 가산세가 붙어요.",
    legal: true,
    laws: [LAW.acqTax, LAW.acqDate, LAW.acqLateFile],
    links: [SITE.wetax],
    more: { label: "취득세 포함 필요 현금 계산", href: "/calculator" },
  },
  {
    id: "a-registration",
    phase: "afterBalance",
    title: "소유권이전등기 신청",
    desc:
      "잔금을 치른 날부터 60일 안에 등기를 신청해야 해요. 늦으면 과태료가 붙을 수 있어요. 등기가 끝나면 등기부에 내 이름이 올랐는지 확인하세요.",
    legal: true,
    laws: [LAW.registration, LAW.registrationFine],
    links: [SITE.iros],
  },
  /* ── 입주 뒤(법정 14일) ── */
  {
    id: "mi-report",
    phase: "moveIn",
    title: "전입신고",
    desc: "새 집으로 옮긴 날부터 14일 안에 주민센터나 정부24에서 해요. 늦으면 과태료가 붙어요.",
    legal: true,
    laws: [LAW.moveIn, LAW.moveInFine],
    links: [SITE.gov24],
  },
];

/* 날짜 계산은 lib/journey/dates.ts(가벼운 모듈 — /journey 화면은 이 파일의 항목 글을 싣지 않는다) */
export { addDays, daysBetween, ddayLabel, formatKoreanDay, kstDayOf, kstToday } from "./dates";
export { HOLIDAYS_CHECKED_ON, HOLIDAY_YEARS } from "./holidays";

/** 마지막 날이 쉬는 날일 때의 근거 — 화면 고지·캘린더 설명에 같은 글을 쓴다 */
export const REST_DAY_RULE = "마지막 날이 토·일·공휴일이면 다음 평일까지 — 민법 제161조·지방세기본법 제24조";
export const REST_DAY_LAWS: readonly RefLink[] = [
  { label: "민법 제161조", href: lawHref("민법", "제161조") },
  { label: "지방세기본법 제24조", href: lawHref("지방세기본법", "제24조") },
];

export type ContractDates = {
  contractDate: string | null;
  midDate: string | null;
  balanceDate: string | null;
  moveInDate: string | null;
};

/** 기준일 — 입주일이 없으면 잔금일(전입신고 기한 계산) */
export function anchorDay(anchor: ContractAnchor, d: ContractDates): string | null {
  switch (anchor) {
    case "contract":
      return d.contractDate;
    case "mid":
      return d.midDate;
    case "balance":
      return d.balanceDate;
    case "moveIn":
      return d.moveInDate ?? d.balanceDate;
  }
}

/**
 * 법이 센 마지막 날(쉬는 날 연장 전). 기한 날짜는 기준일 **다음 날부터** 센다(민법 제157조 — 첫날 불산입):
 * 계약일 9/1 → 30일 이내 = 10/1. 권장 시점(잔금 1~2개월 전)이 계약일보다 앞서면 계약일로 당긴다(이미 지난 권장일을
 * 보여 주지 않는다).
 */
export function phaseNominalDue(phase: ContractPhase, d: ContractDates): string | null {
  const meta = CONTRACT_PHASES[phase];
  const base = anchorDay(meta.anchor, d);
  if (!base) return null;
  const due = addDays(base, meta.offsetDays);
  if (meta.suggested && d.contractDate && daysBetween(d.contractDate, due) < 0) return d.contractDate;
  return due;
}

/**
 * 단계의 날짜 — 법정 기한은 마지막 날이 토·일·공휴일이면 다음 평일(민법 제161조·지방세기본법 제24조,
 * lib/journey/holidays.ts). 예: 계약일 2026-09-03 → 30일째 10/3(토·개천절) → 10/4(일) → 10/5(대체공휴일) → 10/6(화).
 * 계약일·잔금일처럼 내가 정한 날과 권장 시점은 그대로 둔다.
 */
export function phaseDue(phase: ContractPhase, d: ContractDates): string | null {
  const nominal = phaseNominalDue(phase, d);
  if (!nominal || !CONTRACT_PHASES[phase].legal) return nominal;
  return nextWorkday(nominal);
}

/** "10월 3일(토·개천절)" — 공휴일이면 이름을 붙인다 */
export function formatKoreanDayRest(day: string): string {
  const name = holidayName(day);
  const base = formatKoreanDay(day);
  return name ? `${base.slice(0, -1)}·${name})` : base;
}

export type EntryState = "done" | "overdue" | "today" | "soon" | "later" | "undated";

export type TimelineGroup = {
  phase: ContractPhase;
  meta: PhaseMeta;
  /** 실제 기한(법정 기한은 쉬는 날이면 다음 평일로 미룬 날) */
  due: string | null;
  /** 법이 센 마지막 날 — due 와 다르면 그날이 쉬는 날이라 미뤄진 것 */
  nominalDue: string | null;
  daysLeft: number | null;
  items: { item: ContractItem; checked: boolean; state: EntryState }[];
  /** 그룹 전체가 체크됐는가 */
  allChecked: boolean;
};

/** 가까운 기한 강조 폭(일) */
export const SOON_DAYS = 7;

function entryState(checked: boolean, daysLeft: number | null): EntryState {
  if (checked) return "done";
  if (daysLeft === null) return "undated";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  return daysLeft <= SOON_DAYS ? "soon" : "later";
}

/**
 * 일정표 — 단계(phase)별로 묶어 날짜순. 날짜를 모르는 단계는 뒤로(단계 순서 그대로).
 * 중도금 단계는 중도금일을 넣었을 때만 싣는다(중도금이 없는 거래가 많다).
 * today 가 null 이면(서버 렌더·첫 렌더) 남은 날을 계산하지 않는다.
 */
export function buildContractTimeline(
  d: ContractDates,
  checked: ReadonlySet<string>,
  today: string | null,
): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const phase of PHASE_ORDER) {
    if (phase === "mid" && !d.midDate) continue;
    const meta = CONTRACT_PHASES[phase];
    const due = phaseDue(phase, d);
    const nominalDue = phaseNominalDue(phase, d);
    const daysLeft = due && today ? daysBetween(today, due) : null;
    const items = CONTRACT_ITEMS.filter((i) => i.phase === phase).map((item) => {
      const c = checked.has(item.id);
      return { item, checked: c, state: entryState(c, daysLeft) };
    });
    groups.push({ phase, meta, due, nominalDue, daysLeft, items, allChecked: items.every((i) => i.checked) });
  }
  const order = (p: ContractPhase) => PHASE_ORDER.indexOf(p);
  return groups.sort((a, b) => {
    if (a.due && b.due) {
      const diff = daysBetween(b.due, a.due);
      if (diff !== 0) return diff;
    } else if (a.due || b.due) {
      return a.due ? -1 : 1;
    }
    return order(a.phase) - order(b.phase);
  });
}

/** 아직 다 끝내지 않은 가장 가까운 날(오늘 포함, 지난 것 제외) — 요약 줄 "다음 할 일" */
export function nextDeadline(groups: readonly TimelineGroup[]): TimelineGroup | null {
  return groups.find((g) => !g.allChecked && g.daysLeft !== null && g.daysLeft >= 0) ?? null;
}

/** 쉬는 날이라 미뤄진 기한의 한 줄 설명 — 미뤄지지 않았으면 null */
export function restDayNote(g: TimelineGroup): string | null {
  if (!g.due || !g.nominalDue || g.due === g.nominalDue) return null;
  return `원래 ${formatKoreanDayRest(g.nominalDue)}이지만 쉬는 날이라 다음 평일까지예요`;
}

/**
 * 지난 법정 기한 가운데 아직 체크하지 않은 항목 수 — 남은 기한이 없을 때 요약 줄이 "다 했어요"라고
 * 거짓말하지 않게(리뷰 C: 날짜가 모두 지났고 체크 0개인데 "모두 체크했어요"가 떴다).
 */
export function overdueLegalCount(groups: readonly TimelineGroup[]): number {
  return groups
    .filter((g) => g.meta.legal && g.daysLeft !== null && g.daysLeft < 0)
    .reduce((n, g) => n + g.items.filter((i) => !i.checked).length, 0);
}

/** 입력 점검 — 화면에 한 줄로 알린다(막지는 않는다) */
export function contractDateWarnings(d: ContractDates): string[] {
  const out: string[] = [];
  if (d.contractDate && d.balanceDate && daysBetween(d.contractDate, d.balanceDate) < 0) {
    out.push("잔금일이 계약일보다 빨라요. 날짜를 확인해 주세요.");
  }
  if (d.contractDate && d.midDate && daysBetween(d.contractDate, d.midDate) < 0) {
    out.push("중도금일이 계약일보다 빨라요.");
  }
  if (d.midDate && d.balanceDate && daysBetween(d.midDate, d.balanceDate) < 0) {
    out.push("중도금일이 잔금일보다 늦어요.");
  }
  if (d.moveInDate && d.balanceDate && daysBetween(d.balanceDate, d.moveInDate) < 0) {
    out.push("입주일이 잔금일보다 빨라요.");
  }
  return out;
}

/* ─────────────────────────────── 캘린더(.ics, RFC 5545) ─────────────────────────────── */

/** TEXT 값 이스케이프(RFC 5545 3.3.11) — 역슬래시·세미콜론·쉼표는 앞에 역슬래시, 줄바꿈은 \\n */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 한 줄을 75옥텟(UTF-8)으로 접는다 — 이어지는 줄은 공백 하나로 시작. 글자(코드포인트)를 쪼개지 않는다. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = " ";
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

function icsStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsDate(day: string): string {
  return day.replace(/-/g, "");
}

export type IcsOptions = {
  now: Date;
  /** 일정표 화면 주소(설명에 넣는다) */
  pageUrl: string;
};

/**
 * 날짜가 있고 아직 다 끝내지 않은 단계마다 종일 일정 하나. 법정 기한은 3일 전 오전 9시, 계약일·잔금일은
 * 전날 오전 9시에 알림(종일 일정의 시작은 그날 0시라 -P2DT15H = 사흘 전 9시).
 * 서버를 거치지 않는다 — 브라우저가 Blob 으로 내려받는다.
 */
export function buildContractIcs(groups: readonly TimelineGroup[], opts: IcsOptions): string {
  const stamp = icsStamp(opts.now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//naezipnow//journey-contract//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape("내집나우 계약·잔금 일정")}`,
  ];
  for (const g of groups) {
    /* 날짜 없음 · 다 끝냄 · 이미 지난 날(오늘을 아는 경우)은 싣지 않는다 — 지난 알림은 울리지도 않는다 */
    if (!g.due || g.allChecked || (g.daysLeft !== null && g.daysLeft < 0)) continue;
    const todo = g.items.filter((i) => !i.checked);
    const rest = restDayNote(g);
    const descLines = [
      `${g.meta.dueText} · ${formatKoreanDay(g.due)}`,
      ...(rest ? [`${rest}(${REST_DAY_RULE.split(" — ")[1]})`] : []),
      ...todo.map((i) => {
        const laws = i.item.laws?.length ? ` (${i.item.laws.map((l) => l.label).join(", ")})` : "";
        return `☐ ${i.item.title}${laws}`;
      }),
      "",
      "일반 정보이며 법률·세무 자문이 아닙니다.",
      opts.pageUrl,
    ];
    lines.push(
      "BEGIN:VEVENT",
      `UID:jr-${g.phase}-${icsDate(g.due)}@naezipnow.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(g.due)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(g.due, 1))}`,
      `SUMMARY:${icsEscape(`[내 집 마련] ${g.meta.calendarTitle}`)}`,
      `DESCRIPTION:${icsEscape(descLines.join("\n"))}`,
      `URL:${opts.pageUrl}`,
      "TRANSP:TRANSPARENT",
    );
    const alarm = g.meta.legal ? "-P2DT15H" : g.phase === "contractDay" || g.phase === "balanceDay" ? "-PT15H" : null;
    if (alarm) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape(g.meta.calendarTitle)}`,
        `TRIGGER:${alarm}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** 캘린더에 넣을 일정이 있는가(버튼 활성 판정) — buildContractIcs 와 같은 기준 */
export function hasCalendarEvents(groups: readonly TimelineGroup[]): boolean {
  return groups.some((g) => Boolean(g.due) && !g.allChecked && !(g.daysLeft !== null && g.daysLeft < 0));
}

/** 만원 → "8억 5,000만 원" */
export function formatManwon(manwon: number): string {
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  const parts2: string[] = [];
  if (eok > 0) parts2.push(`${eok.toLocaleString("ko-KR")}억`);
  if (rest > 0) parts2.push(`${rest.toLocaleString("ko-KR")}만`);
  return parts2.length ? `${parts2.join(" ")} 원` : "0원";
}

/* ─────────────────────────────── [1009 · T] 계약금 · 중도금 · 잔금 ─────────────────────────────── */

export type PaymentSplit = {
  priceManwon: number;
  depositManwon: number | null;
  midManwon: number | null;
  /** 잔금 = 매매가 − 계약금 − 중도금. 계약금을 모르면 null(매매가 전액을 잔금이라 부르지 않는다) */
  balanceManwon: number | null;
  /** 계약금 + 중도금이 매매가를 넘는다 — 잔금을 만들지 않고 알린다 */
  over: boolean;
};

/**
 * 계약 일정표의 돈 — 매매가와 계약금(·중도금)을 넣었을 때만 잔금을 계산한다(값을 지어내지 않는다).
 * 왜(2026-09-22): 일정표는 날짜만 받아 "계약일에 얼마, 잔금일에 얼마"를 말하지 못했다 — 잔금일은 가장 큰 돈이 나가는 날인데
 * 그 금액이 화면 어디에도 없었다. 매매가가 없으면 null.
 */
export function paymentSplit(plan: {
  priceManwon: number | null;
  depositManwon?: number | null;
  midManwon?: number | null;
}): PaymentSplit | null {
  const price = plan.priceManwon;
  if (price == null || !(price > 0)) return null;
  const deposit = plan.depositManwon ?? null;
  const mid = plan.midManwon ?? null;
  const paid = (deposit ?? 0) + (mid ?? 0);
  const over = paid > price;
  const balanceManwon = deposit !== null && !over ? price - paid : null;
  return { priceManwon: price, depositManwon: deposit, midManwon: mid, balanceManwon, over };
}

/** 계약금 흔한 비율(매매가의 10%) — 사용자가 누를 때만 채운다(자동으로 넣지 않는다). 만원 단위 반올림 */
export function depositAtTenPercent(priceManwon: number): number {
  return Math.round(priceManwon * 0.1);
}
