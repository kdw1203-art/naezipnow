#!/usr/bin/env node
/* [1012] "AI 가 만든 사이트" 신호 게이트 — docs/design-system.md v3 의 ★ 규칙을 빌드에서 강제한다.
 *
 *  검사(전부 app/**\/*.tsx 의 소스 문자열 기준):
 *   1. 임의 반경 `rounded-[Npx]` 금지 — 눈금은 sm(4)·lg/xl/2xl(8)·3xl(12)·4xl(16)·full 뿐
 *   2. 그라데이션 금지 — 허용 파일(사진 오버레이·스켈레톤·마스크·OG 라우트·광고 배너)만 예외
 *   3. UI 문자열의 이모지 금지 — Icon.tsx 의 이모지→아이콘 매핑표와 UGC 렌더는 예외
 *   4. 금지 문구 — "지금 시작" "시작하세요" "시작하기" "무료로 시작" "더 알아보기" "자세히 알아보기" "지금 바로"
 *      + [1028] "아니라 조회" "LLM 아님" "브라우즈" "온보딩 루프" "실연동" "인사이트"
 *   5. 큰 그림자(shadow-lg/xl, --shadow-float-xl, --shadow-glow) — 모달·시트·드롭다운 파일만
 *   6. [1012-R2] 채움 파랑(`btn-primary`) — 규칙 9 "화면 하나에 채움 파랑 버튼 1개"를 두 겹으로 잡는다
 *      6a FAIL: **파일 하나**에 `btn-primary` 리터럴이 2개 이상이면 실패. 정당한 예외(상태 분기·모달·다단 폼)는
 *          PRIMARY_ALLOW 에 [경로, 상한, 이유] 로 적는다. 상한은 래칫 — 늘면 FAIL, 줄면 내리라고 알린다.
 *      6b WARN: app/**\/page.tsx 와 그 페이지가 **직접** import 하는 .tsx 를 합쳐 2개 이상이면 목록만 출력(실패 아님).
 *          화면 단위 집계의 근사치 — 조건 분기까지는 못 읽으므로 사람이 보는 목록이다.
 *
 *  사용: node scripts/check-ai-look.mjs  (npm run build 체인)
 *  예외를 늘릴 때는 아래 목록에 **이유**를 한 줄 적는다. 이유 없는 예외는 리뷰에서 되돌린다. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-ai-look]";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/* ── 예외 목록 (파일 경로 접두 · 이유) ─────────────────────────────────────────── */
const GRADIENT_ALLOW = [
  ["app/api/og/", "OG 공유 이미지 — 화면이 아니라 카드 이미지, 어두운 면의 미세 명암"],
  ["app/components/CoverImage.tsx", "사진 위 글자 가독 오버레이(검정→투명)"],
  ["app/notes/[id]/deck/DeckViewer.tsx", "사진 위 글자 가독 오버레이"],
  ["app/notes/notes-feed-client.tsx", "사진 위 글자 가독 오버레이(from-black)"],
  ["app/notes/[id]/NoteSoftWall.tsx", "본문 아래 흰색 페이드(소프트월) — 마스크 성격"],
  ["app/town/TownCategoryNav.tsx", "가로 레일 오른쪽 페이드 마스크(mask-image)"],
  ["app/components/ads/AdSlot.tsx", "광고주 배너 색은 운영자가 관리 화면에서 정한다(기본값은 단색)"],
  ["app/admin/", "관리자 화면"],
  ["app/map/MapClientLazy.tsx", "지도 로딩 스켈레톤(연회색 두 톤)"],
  ["app/map/map-client.tsx", "지도 로딩 폴백 스켈레톤"],
];
const EMOJI_ALLOW = [
  ["app/components/Icon.tsx", "이모지 → 선 아이콘 매핑표(렌더되는 건 아이콘)"],
  ["app/admin/", "관리자 화면"],
];
const SHADOW_ALLOW = [
  ["app/components/MobileMenu.tsx", "전체 메뉴 시트"],
  ["app/components/Header.tsx", "헤더 드롭다운"],
  ["app/components/DesktopSideNav.tsx", "좌측 내비 패널"],
  ["app/components/explain/ExplainSheet.tsx", "설명 시트"],
  ["app/components/ui/", "공용 모달·시트·토스트"],
  ["app/components/CoachmarkTour.tsx", "코치마크 플로팅"],
  ["app/components/InstallPrompt.tsx", "설치 안내 플로팅"],
  ["app/admin/", "관리자 화면"],
  ["app/components/RegionPicker.tsx", "지역 선택 드롭다운"],
  ["app/components/UpgradePaywall.tsx", "결제 유도 모달"],
  ["app/layout.tsx", "전역 토스트·플로팅"],
  ["app/listings/new/ListingForm.tsx", "하단 고정 저장 바"],
  ["app/map/", "지도 위 플로팅 패널(매물 미리보기·안내)"],
  ["app/notes/new/NoteLocationSearch.tsx", "주소 검색 드롭다운"],
  ["app/notes/new/NoteLocationDropdown.tsx", "주소 검색 드롭다운(1032 · 지연 조각으로 분리)"],
];
const PHRASE_ALLOW = [
  ["app/admin/", "관리자 화면"],
];
/* [1012-R2 · 규칙 6a] 파일당 `btn-primary` 리터럴 상한 — [경로(정확히 일치), 상한, 이유].
   "상태 분기" = 로그인/빈/오류/완료처럼 한 번에 하나만 그려지는 가지. "트리거+모달" = 여는 버튼과 모달 안 제출
   (모달이 화면을 덮으므로 동시에 보이지 않는다). "동시 렌더" = 한 화면에 실제로 둘 이상 보이는 것 —
   담당 축이 줄여야 할 대상이고, 여기서는 **늘지만 못하게** 상한만 고정한다(1012 R2 실측값).
   상한을 내릴 때는 이유도 같이 고친다. 새 파일에서 2개 이상이면 목록에 넣지 말고 하나로 줄인다. */
const PRIMARY_ALLOW = [
  ["app/notes/notes-feed-client.tsx", 2, "[1016] 반응형 분기 — 폰 CTA(md:hidden)와 데스크톱 왼쪽 레일 노트 쓰기(lg만). 한 화면엔 하나"],
    ["app/dev-deals/DevDealsListClient.tsx", 2, "동시 렌더 — 목록 행마다 '참여 문의' + 빈 화면 '개발물건 등록' + 상단 등록 링크(담당: dev-deals)"],
  ["app/dev-deals/new/DealForm.tsx", 2, "상태 분기 — 완료 화면 링크 / 제출"],
  ["app/dev-deals/partners/new/PartnerForm.tsx", 2, "상태 분기 — 완료 화면 링크 / 제출"],
  ["app/listings/new/ListingForm.tsx", 3, "상태 분기(완료 링크) + 지도 위치 확정 오버레이 + 제출 — 오버레이·제출은 동시 가능(담당: listings)"],
  ["app/map/map-client.tsx", 7, "동시 렌더 가능 — 지도 위 패널·시트·모바일/데스크탑 분기(hidden md:inline-flex)마다 1개(담당: map) · [1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/my/MyHubView.tsx", 3, "동시 렌더 — 다음 단계·매물 등록·카드 재등록/플랜·포인트 상점 섹션마다 1개(담당: my) · [1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/my/consultations/ConsultReply.tsx", 2, "트리거(삼항: 답변 있으면 outline)+모달 제출"],
  ["app/my/consultations/ProposeQuote.tsx", 2, "트리거+모달 — 견적 제안 → 제출"],
  ["app/my/creator/page.tsx", 2, "상태 분기 — 비로그인 / 로그인"],
  ["app/my/expert-profile/page.tsx", 2, "상태 분기 — 프로필 없음 두 가지 빈 화면, 같은 링크"],
  ["app/my/listings/BoostButton.tsx", 2, "트리거+확인 — 끌어올리기 → 확인"],
  ["app/my/listings/ListingManageActions.tsx", 2, "동시 렌더 — 저장 + 거래완료 마감(담당: my)"],
  ["app/my/subscription/SubscriptionManageClient.tsx", 3, "삼항(정지 시만 primary) + 모달 확인 + 재구독 링크(상태 분기) · [1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/notes/compare/page.tsx", 4, "상태 분기 — need_login / need_more / 결과 / 오류, 각 1개 · [1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/notes/templates/[id]/page.tsx", 2, "상태 분기 — 템플릿 없음 화면 / 본문 CTA"],
  ["app/payment/success/GuestClaimForm.tsx", 2, "상태 분기 — 완료(done) 링크 / 제출"],
  ["app/payment/success/page.tsx", 4, "상태 분기 — !ok / guestPending / returnTo / 기본, 각 1개"],
  ["app/quiz/QuizGame.tsx", 2, "상태 분기 — 결과 화면 공유 / 진행 중 '다음'"],
  ["app/reset-password/page.tsx", 3, "상태 분기 — 완료 / 만료 / 폼 제출"],
  ["app/signup/SignupClient.tsx", 2, "상태 분기 — 인증 메일 안내의 로그인 링크 / 가입 제출"],
  ["app/subscription/billing/BillingEnrollClient.tsx", 2, "상태 분기 — 비로그인 유도 링크 / 카드 등록"],
  ["app/subscription/checkout/CheckoutClient.tsx", 4, "상태 분기 — guestPay / preview / ready / window-ready, 각 1개"],
  ["app/support/SupportContactForm.tsx", 2, "상태 분기 — 접수 완료(로그인 시 내역 링크) / 제출"],
  ["app/town/experts/ConsultButton.tsx", 3, "기본 className 인자 + 열림 버튼 + 모달 제출(트리거+모달)"],
  ["app/town/experts/ExpertApplyCta.tsx", 2, "기본 className 인자 + 모달 닫기(트리거+모달)"],
  ["app/town/experts/QuoteRequest.tsx", 2, "트리거+모달 — 견적 요청 → 제출"],
  ["app/town/groups/CreateGroupCta.tsx", 2, "트리거+모달 — 모임 만들기 → 제출"],
  ["app/town/groups/GroupsClient.tsx", 2, "목록 행 삼항(joinable ? primary : soft) + 만들기 폼 제출 — 동시 가능(담당: town)"],
  ["app/town/groups/[id]/ChatRoom.tsx", 2, "내 말풍선이 btn-primary 를 면으로 쓴다 + 보내기 — 말풍선은 버튼이 아니므로 클래스 교체 대상(담당: town)"],
  ["app/town/groups/[id]/chat/page.tsx", 2, "상태 분기 — 없음 / 로그인 유도"],
  ["app/town/groups/[id]/page.tsx", 3, "상태 분기 — 없음 / 참여 삼항 / 로그인 유도"],
  ["app/town/library/[id]/page.tsx", 2, "상태 분기 — 구매 완료 열람 / 무료 열람"],
  ["components/ListingCompareTray.tsx", 2, "삼항 — canCompare ? 비교 링크 : 비활성 버튼(같은 자리)"],
  ["app/listings/ListingsListClient.tsx", 2, "[1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/my/points/CopyLink.tsx", 2, "[1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/notes/[id]/card/NoteCardStudio.tsx", 2, "[1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/notes/new/NoteForm.tsx", 2, "[1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/subscription/payment-methods/page.tsx", 2, "[1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
  ["app/town/write/page.tsx", 2, "[1014] 개편(v4) 전 구조 복원 — 주인님 지시(원래 디자인 컨셉 유지). 보조 버튼을 outline 으로 내리는 일은 다음 판"],
];

const BANNED_PHRASES = [
  "지금 시작", "시작하세요", "시작하기", "무료로 시작", "더 알아보기", "자세히 알아보기", "지금 바로", "Learn more", "Get started",
  /* [1028] 문구 정리에서 걷어낸 말이 다시 들어오지 않게 — "없는 게 아니라 조회가 실패" 대비 구문(오류 문구는 "○○을 불러오지
     못했어요. 잠시 후 다시 시도해 주세요."), 화면에 나간 내부·개발 낱말, 규칙 계산에 붙이던 "인사이트" */
  "아니라 조회", "LLM 아님", "브라우즈", "온보딩 루프", "실연동", "인사이트",
];
/* 이모지 = 색깔 있는 그림 문자(U+1F300~1FAFF)와 ✨⭐✅❌❗ 국기. ✓ ✕ ★ ✦ ☐ 같은 단색 활자 기호는
   기준 사이트도 쓰는 정상 타이포그래피라 잡지 않는다. `<Icon name="📍">` 처럼 아이콘 매핑 키로만 쓰인
   이모지는 선 아이콘으로 렌더되므로 검사에서 뺀다(name="…" 속성 제거 후 검사). */
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]|[\u{2728}\u{2B50}\u{2705}\u{274C}\u{2757}]/u;
const stripIconNames = (line) => line.replace(/name=\{?"[^"]*"\}?/g, "");
const ARB_RADIUS_RE = /rounded(?:-[a-z]{1,2})?-\[\d+px\]/;
const GRADIENT_RE = /(?:linear|radial|conic|repeating-linear)-gradient\(|bg-gradient-to-/;
const BIG_SHADOW_RE = /\bshadow-(?:lg|xl|2xl)\b|--shadow-float-xl|--shadow-glow|shadow-\[var\(--shadow-lg\)\]/;

const allowed = (list, rel) => list.some(([prefix]) => rel.startsWith(prefix));
/** 주석·import 줄은 검사하지 않는다 — 설명 문장 안의 낱말까지 잡으면 규칙 기록을 못 남긴다. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/* [1012-R2 · 규칙 6] `btn-primary` 리터럴 — 낱말 경계로 센다(btn-primary-x 같은 파생 클래스는 없지만 대비).
   주석은 위 stripComments 로 이미 지워진 뒤라 설명 문장 안의 낱말은 세지 않는다. */
const PRIMARY_RE = /\bbtn-primary\b/g;
/** page.tsx 가 **직접** import 하는 .tsx 를 푼다 — 상대 경로와 `@/`(tsconfig paths: 저장소 루트)만.
 *  패키지·.ts(JSX 없음)·동적 import 는 세지 않는다. 화면 단위 근사치라 한 단계만 따라간다. */
function directTsxImports(abs, src) {
  const out = new Set();
  const re = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    let base = null;
    if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(abs), spec);
    else if (spec.startsWith("@/")) base = join(root, spec.slice(2));
    if (!base) continue;
    for (const cand of [base, `${base}.tsx`, join(base, "index.tsx")]) {
      if (/\.tsx$/.test(cand) && existsSync(cand) && statSync(cand).isFile()) {
        out.add(cand);
        break;
      }
    }
  }
  return out;
}

const files = walk(join(root, "app"));
const problems = [];
/** rel → { abs, src } — 규칙 6 이 뒤에서 다시 읽지 않도록 */
const primaryCount = new Map();
const sources = new Map();
/* 규칙 6a 는 루트 components/(app 밖의 공용 UI — 트레이·배너)도 센다. 규칙 1~5 의 범위(app/)는 그대로. */
for (const abs of walk(join(root, "components"))) {
  const rel = relative(root, abs).replace(/\\/g, "/");
  primaryCount.set(rel, (stripComments(readFileSync(abs, "utf8")).match(PRIMARY_RE) ?? []).length);
}
for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, "/");
  const src = stripComments(readFileSync(abs, "utf8"));
  sources.set(rel, { abs, src });
  primaryCount.set(rel, (src.match(PRIMARY_RE) ?? []).length);
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (ARB_RADIUS_RE.test(line)) problems.push(`${at}  임의 반경 — ${line.trim().match(ARB_RADIUS_RE)[0]} (눈금: rounded-sm·lg·xl·2xl·3xl·4xl·full)`);
    if (GRADIENT_RE.test(line) && !allowed(GRADIENT_ALLOW, rel)) problems.push(`${at}  그라데이션 — 배경·카드·버튼·글자에 금지 (예외는 게이트 목록에 이유와 함께)`);
    if (EMOJI_RE.test(stripIconNames(line)) && !allowed(EMOJI_ALLOW, rel)) problems.push(`${at}  이모지 — UI 문자열에 금지: ${line.trim().slice(0, 60)}`);
    if (BIG_SHADOW_RE.test(line) && !allowed(SHADOW_ALLOW, rel)) problems.push(`${at}  큰 그림자 — 모달·시트·드롭다운 밖에서는 --shadow-sm/md 만`);
    if (!allowed(PHRASE_ALLOW, rel)) {
      for (const ph of BANNED_PHRASES) {
        if (line.includes(ph)) problems.push(`${at}  금지 문구 "${ph}" — CTA 는 동사+구체 대상으로: ${line.trim().slice(0, 70)}`);
      }
    }
  });
}

/* ── 규칙 6a (FAIL) — 파일당 btn-primary ≥ 2 ─────────────────────────────────── */
const primaryCap = new Map(PRIMARY_ALLOW.map(([p, cap]) => [p, cap]));
const primaryNotes = [];
for (const [rel, n] of primaryCount) {
  const cap = primaryCap.get(rel);
  if (n >= 2 && cap === undefined) {
    problems.push(`${rel}  채움 파랑 ${n}개 — 화면당 btn-primary 1개(규칙 9). 보조는 btn-outline/btn-soft 로. 상태 분기·모달이면 PRIMARY_ALLOW 에 [경로, 상한, 이유]`);
  } else if (cap !== undefined && n > cap) {
    problems.push(`${rel}  채움 파랑 ${n}개 — PRIMARY_ALLOW 상한 ${cap}개를 넘었다(래칫). 늘리지 말고 하나로 줄이세요`);
  } else if (cap !== undefined && n < cap) {
    primaryNotes.push(`${rel}  ${cap} → ${n}개로 줄었다 — PRIMARY_ALLOW 상한을 ${n < 2 ? "지우세요(항목 삭제)" : `${n} 으로 내리세요`}`);
  }
}
for (const [p] of PRIMARY_ALLOW) {
  if (!primaryCount.has(p)) primaryNotes.push(`${p}  PRIMARY_ALLOW 에 있지만 파일이 없다 — 항목을 지우세요`);
}

/* ── 규칙 6b (WARN) — 화면(page.tsx + 직접 import .tsx) 단위 btn-primary ≥ 2 ─────── */
const screenWarnings = [];
for (const [rel, { abs, src }] of sources) {
  if (!/(^|\/)page\.tsx$/.test(rel)) continue;
  const parts = [[rel, primaryCount.get(rel) ?? 0]];
  for (const dep of directTsxImports(abs, src)) {
    const depRel = relative(root, dep).replace(/\\/g, "/");
    const n = primaryCount.get(depRel);
    /* app/·components/ 밖(lib/ 의 .tsx 등)은 walk 대상이 아니라 직접 센다 */
    const count = n ?? (stripComments(readFileSync(dep, "utf8")).match(PRIMARY_RE) ?? []).length;
    if (count > 0) parts.push([depRel, count]);
  }
  const total = parts.reduce((a, [, n]) => a + n, 0);
  if (total >= 2) screenWarnings.push(`${rel}  합계 ${total}개 — ${parts.filter(([, n]) => n > 0).map(([f, n]) => `${f}(${n})`).join(" + ")}`);
}

if (problems.length) {
  console.error(`${TAG} FAIL — ${problems.length}건 (docs/design-system.md v3 규칙 1~5 · 6a)`);
  for (const p of problems.slice(0, process.env.AILOOK_ALL ? 100000 : 80)) console.error("  " + p);
  if (problems.length > 80) console.error(`  … 외 ${problems.length - 80}건`);
  process.exit(1);
}
const allowedPrimaryFiles = [...primaryCount.values()].filter((n) => n >= 2).length;
console.log(
  `${TAG} PASS — 임의 반경 0 · 장식 그라데이션 0 · UI 이모지 0 · 금지 문구 0 · 큰 그림자 0 · 파일당 채움 파랑 ≥2 는 허용 목록 ${allowedPrimaryFiles}개뿐(상한 초과 0) (${files.length} 파일)`,
);
for (const n of primaryNotes) console.log(`  ${TAG} 정리: ${n}`);
if (screenWarnings.length) {
  console.log(`${TAG} 경고(FAIL 아님) — 화면 단위(page.tsx + 직접 import .tsx) 채움 파랑 ≥2: ${screenWarnings.length}화면. 조건 분기는 못 읽으므로 눈으로 확인할 목록이다.`);
  for (const w of screenWarnings.slice(0, 60)) console.log(`  ${w}`);
  if (screenWarnings.length > 60) console.log(`  … 외 ${screenWarnings.length - 60}화면`);
}
