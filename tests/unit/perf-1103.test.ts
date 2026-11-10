/* [1103 · 속도 · 번들 여유] 2026-11-03 Lighthouse(주간): 홈 성능 69 · /map 51(문턱 70). 번들 게이트 경고:
 *  /my/settings 492.8KB(미등재 상한 495KB · Vercel 빌드는 로컬보다 조금 크다 → 배포가 멈출 수 있는 자리).
 *  ① /my/settings — 셸(PageShell)을 서버 page.tsx 가 감싼다(푸터 · 사업자 고지가 클라이언트 번들에서 빠진다 · 79567 조각 7.8KB) ·
 *     프로필 편집 시트(폼 검증 · 지역 목록 · 모달 = 27068 + 28082 조각 24.9KB)는 따로 받는 조각(프로필 조회와 같이 받기 시작) ·
 *     signOut(next-auth/react 96199 조각 5.5KB)은 탈퇴 접수 뒤에만 받는다. 합계 ~38KB → 492.8 → ~455KB 예상(실제 빌드로 확인).
 *  ② 홈 — 이어서 쓰기 팝업(초안 파서 · 상대 시각 ~8KB)과 관심 단지 요약(~2.7KB)을 첫 로드 번들에서 뗀다 ·
 *     서울 구별 막대는 목록 한 벌(예전엔 폰 · 데스크톱 두 벌을 그리고 CSS 로 숨겨 홈 DOM 의 30% · HTML 30KB 가 접힌 칸 안에 두 번). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const code = (p: string) => strip(read(p));

test("/my/settings — 셸은 서버 page.tsx 가 감싼다(클라이언트 SettingsClient 는 PageShell 을 import 하지 않는다)", () => {
  const client = code("app/my/settings/SettingsClient.tsx");
  assert.ok(client.trimStart().startsWith('"use client"'));
  assert.doesNotMatch(client, /PageShell/, "클라이언트 경계 안에서 셸을 감싸면 서버 조각(푸터)까지 브라우저 번들에 실린다");
  assert.doesNotMatch(client, /from "@\/app\/components\/Footer"/);
  const page = code("app/my/settings/page.tsx");
  assert.doesNotMatch(page, /"use client"/, "page.tsx 는 서버 컴포넌트");
  assert.match(page, /import \{ PageShell \} from "@\/app\/components\/PageShell";/);
  /* [1135] 셸 안: 기본 정보 카드 → 설정(둘 다 셸의 자식) */
  assert.match(page, /<PageShell title="설정" breadcrumb="마이 › 설정">[\s\S]*<BasicInfoCard \/>\s*<SettingsClient channels=\{channels\} \/>\s*<\/PageShell>/);
  /* DOM 은 그대로 — 셸 children 자리에 예전과 같은 바깥 div */
  assert.match(client, /return \(\s*<div className="mx-auto flex w-full max-w-\[560px\] flex-col gap-4">/);
});

test("/my/settings — 프로필 편집 시트는 따로 받는 조각 · 프로필 조회와 같이 받기 시작 · 받기 전엔 같은 모양의 잠긴 단추", () => {
  const client = code("app/my/settings/SettingsClient.tsx");
  assert.doesNotMatch(client, /^import \{ ProfileEditSheet \} from/m, "정적 import 금지(첫 로드 25KB)");
  assert.match(client, /^import type \{ ProfileEditSheet as ProfileEditSheetComponent \} from "\.\.\/ProfileEditSheet";/m);
  assert.match(client, /const loadProfileEditSheet = \(\) => import\("\.\.\/ProfileEditSheet"\)\.then\(\(m\) => m\.ProfileEditSheet\);/);
  const rows = client.slice(client.indexOf("function ProfileRows()"), client.indexOf("function AccountTab("));
  assert.ok(rows.length > 0);
  /* 조회 효과보다 먼저(마운트 즉시) 시트 조각을 받기 시작한다 — 값이 올 때 보통 이미 와 있다 */
  assert.ok(rows.indexOf("loadProfileEditSheet()") > 0 && rows.indexOf("loadProfileEditSheet()") < rows.indexOf('fetch("/api/me/profile"'));
  assert.match(rows, /<Sheet variant="button" initial=\{profile\} onSaved=\{setProfile\} \/>/);
  assert.match(rows, /<button type="button" disabled aria-busy="true" className="btn-soft btn-md shrink-0">\s*편집\s*<\/button>/, "자리표시 단추 = 실제 단추와 같은 클래스 · 잠김(죽은 컨트롤 아님)");
  /* 실제 시트의 설정 행 단추와 클래스가 같아야 한다(모양이 튀지 않게) */
  assert.match(code("app/my/ProfileEditSheet.tsx"), /className="btn-soft btn-md shrink-0">\s*편집\s*<\/button>/);
});

test("/my/settings — signOut 은 탈퇴 접수 뒤에만 받는다 · 못 받으면 로그아웃 화면", () => {
  const client = code("app/my/settings/SettingsClient.tsx");
  assert.doesNotMatch(client, /^import \{[^}]*signOut[^}]*\} from "next-auth\/react";/m);
  assert.match(
    client,
    /void import\("next-auth\/react"\)\s*\.then\(\(\{ signOut \}\) => signOut\(\{ callbackUrl: "\/\?bye=1" \}\)\)\s*\.catch\(\(\) => window\.location\.assign\("\/logout"\)\);/,
  );
  assert.ok(read("app/logout/LogoutClient.tsx").includes("signOut"), "폴백 목적지(/logout)도 로그아웃을 한다");
});

test("/my/settings — 기존 지연 조각(표시·기록 탭 · 비밀번호 줄 · 푸시 구독)은 그대로", () => {
  const client = code("app/my/settings/SettingsClient.tsx");
  for (const m of ['nextDynamic(() => import("./RecordPrefsTab")', 'nextDynamic(() => import("./PasswordChange")', 'nextDynamic(() => import("@/components/PushSubscribe")']) {
    assert.ok(client.includes(m), m);
  }
});

test("홈 — 이어서 쓰기 팝업은 지연 로더(ssr:false) · 팝업 본체 파일 · 이름은 그대로", () => {
  const lazy = code("app/components/home/ResumeDraftPopupLazy.tsx");
  assert.ok(lazy.trimStart().startsWith('"use client"'));
  assert.match(lazy, /nextDynamic\(\s*\(\) => import\("\.\/ResumeDraftPopup"\)\.then\(\(m\) => m\.ResumeDraftPopup\),\s*\{ ssr: false, loading: \(\) => null \},?\s*\)/);
  const page = code("app/page.tsx");
  assert.match(page, /import \{ ResumeDraftPopupLazy as ResumeDraftPopup \} from "\.\/components\/home\/ResumeDraftPopupLazy";/);
  assert.doesNotMatch(page, /from "\.\/components\/home\/ResumeDraftPopup";/, "본체 정적 import 금지");
  assert.equal((page.match(/<ResumeDraftPopup \/>/g) ?? []).length, 1);
  /* 본체는 서버 HTML 에 원래 아무것도 그리지 않는다(초깃값 null) — ssr:false 로 바꿔도 HTML 이 같은 근거 */
  const body = code("app/components/home/ResumeDraftPopup.tsx");
  assert.match(body, /export function ResumeDraftPopup\(\)/);
  assert.match(body, /useState<NoteDraftSummary \| null>\(null\)/);
  assert.match(body, /if \(!draft\) return null;/);
});

test("홈 — 관심 단지 요약은 로그인 확인 뒤 동적 import(오늘의 활동 카드와 같은 방식)", () => {
  const rail = code("app/components/home/HomeMyRail.tsx");
  assert.doesNotMatch(rail, /^import \{ HomeWatchlistBrief \} from/m);
  assert.match(rail, /const HomeWatchlistBrief = dynamic\(\s*\(\) => import\("@\/app\/components\/HomeWatchlistBrief"\)\.then\(\(m\) => m\.HomeWatchlistBrief\),\s*\{ ssr: false \},?\s*\);/);
  assert.match(rail, /if \(!authed\) return null;[\s\S]*<HomeWatchlistBrief onResolved=\{setBriefHas\} \/>/);
  /* 최근 본 단지는 검색창이 같은 모듈을 쓰므로 떼지 않는다(떼도 줄지 않는다) */
  assert.match(rail, /^import \{ RecentComplexChips \} from "@\/app\/components\/RecentComplexes";/m);
  assert.match(read("app/components/home/HomeHeroSearch.tsx"), /import \{ useRecentComplexes \} from "@\/app\/components\/RecentComplexes";/);
});

test("홈 — 서울 구별 막대는 목록 한 벌 · md 부터 세로 우선 2열 격자(예전 두 목록과 같은 자리)", () => {
  const comp = code("app/components/home/HomeSeoulMoves.tsx");
  assert.equal((comp.match(/<DivergingBars\b/g) ?? []).length, 1, "목록 한 벌");
  assert.doesNotMatch(comp, /md:hidden/, "폰 전용 사본 없음");
  assert.doesNotMatch(comp, /rows\.slice\(/, "반씩 자른 데스크톱 사본 없음");
  assert.match(comp, /style=\{\{ "--nz-seoul-rows": half \} as CSSProperties\}/);
  assert.match(comp, /className="md:grid md:grid-flow-col md:grid-cols-2 md:gap-x-8 md:\[grid-template-rows:repeat\(var\(--nz-seoul-rows\),auto\)\]"/);
  assert.match(comp, /const half = Math\.ceil\(rows\.length \/ 2\);/, "왼쪽 열 = 앞 절반(예전 1~half위 목록)");
  /* 막대 조각은 className 을 목록(ul)에 붙인다 — 격자가 li 에 걸리는 근거 */
  assert.match(code("app/components/viz/DivergingBars.tsx"), /<ul className=\{`m-0 flex list-none flex-col gap-1 p-0 \$\{className \?\? ""\}`\}/);
  /* 서버 조각 그대로(JS 0) · details 그대로 */
  assert.doesNotMatch(comp, /"use client"/);
  assert.match(comp, /<details id="seoul-moves"/);
});
