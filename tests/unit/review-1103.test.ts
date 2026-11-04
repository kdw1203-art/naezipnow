/* [1103] 소유자 2026-11-03 "추가로 작업할 수 있는 사항 검토해서 제안해 줘" → 고른 네 묶음(운영 오류 · 속도 · 남은 화면 · 이전 지시 화면 시안).
 *  운영 오류 · 속도 쪽 고정은 ops-1103 · perf-1103. 이 파일은 남은 화면 · 지도 속도(SDK 먼저) · 페이월 훅 분리. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("지도 속도 — 네이버 SDK 를 지연 로더 마운트 때 같이 띄운다(키 형식 검사 · 실패는 조용히)", () => {
  const lazy = strip(read("app/map/MapClientLazy.tsx"));
  const at = lazy.indexOf('void import("./map-client");');
  assert.ok(at > 0);
  const eff = lazy.slice(at, at + 600);
  assert.match(eff, /const sdkKey = props\.ncpKeyId\?\.trim\(\);/);
  assert.match(eff, /if \(sdkKey && \/\^\[a-z0-9\]\{6,24\}\$\/i\.test\(sdkKey\)\)/);
  const sdk = strip(read("lib/map/naver-maps-sdk.ts"));
  assert.match(sdk, /if \(authFailed\) \{\s*return Promise\.reject\(new Error\(NAVER_MAP_AUTH_FAILURE_MESSAGE\)\);\s*\}\s*if \(win\.naver\?\.maps\)/, "먼저 실패했으면 maps 가 있어도 실패");
  assert.doesNotMatch(sdk.slice(sdk.indexOf("export function installNaverMapAuthFailureHandler")), /^\s*authFailed = false;/m);
  assert.match(eff, /import\("@\/lib\/map\/naver-maps-sdk"\)\s*\.then\(\(m\) => m\.loadNaverMapsScript\(sdkKey, \{ onAuthFailure: \(\) => \{\} \}\)\)\s*\.catch\(/);
});

test("지도 폰 크롬 — 검색 칸과 줌 탭 한 줄 · 칩 줄 136 · 패널 178 · 월세 기준 고지 · 슬라이더 자리", () => {
  const m = strip(read("app/map/map-client.tsx"));
  assert.match(m, /const \[phoneSearchFocus, setPhoneSearchFocus\] = useState\(false\);/);
  assert.match(m, /\$\{phoneSearchFocus \? "right-4" : "right-\[178px\]"\}/);
  assert.match(m, /onFocusCapture=\{\(\) => setPhoneSearchFocus\(true\)\}/);
  assert.match(m, /top-\[calc\(env\(safe-area-inset-top,0px\)\+136px\)\] z-30/);
  assert.match(m, /top-\[calc\(env\(safe-area-inset-top,0px\)\+178px\)\] z-\[41\]/);
  assert.doesNotMatch(m, /\+176px\)\] z-30|\+218px\)\] z-\[41\]/);
  assert.match(m, /text: `월세 = 등록 매물 · 단지 금액은 \$\{txType === "rent" \? "전세 보증금" : "매매"\} 실거래`,/);
  assert.match(m, /loading: \(\) => <div aria-hidden="true" className="h-\[96px\] rounded-lg bg-\[rgba\(16,28,54,\.04\)\]" \/>,/);
});

test("페이월 — 훅만 쓰는 화면은 가벼운 컨텍스트 모듈에서 가져온다(본체가 화면 청크에 딸려 가지 않게)", () => {
  const ctx = read("app/components/upgrade-paywall-context.ts");
  assert.match(ctx, /export const UpgradePaywallContext = createContext/);
  assert.match(ctx, /export function useUpgradePaywall\(\)/);
  assert.ok(!ctx.includes("UpgradePaywall\""), "본체를 가져오지 않는다");
  const prov = read("app/components/UpgradePaywallProvider.tsx");
  assert.match(prov, /export \{ useUpgradePaywall \};/, "예전 경로도 그대로 쓸 수 있다");
  for (const f of [
    "app/complex/[id]/hub-client.tsx",
    "app/map/ComplexInfoPanel.tsx",
    "app/map/WelcomeHandoff.tsx",
    "app/town/news/[id]/PostInteractions.tsx",
    "app/notes/[id]/ai-retry-button.tsx",
    "app/analysis/ai-note-analysis.tsx",
    "app/agent/AgentChat.tsx",
    "app/my/listings/BoostButton.tsx",
  ]) {
    assert.match(read(f), /import \{ useUpgradePaywall \} from "@\/app\/components\/upgrade-paywall-context";/, f);
  }
});

test("남은 화면 — 공매 폰 줄 목록 · 중복 묶음 없음 · 뉴스 문답 접기 · 청약 캘린더 링크 한 번 · 권유문", () => {
  const auc = strip(read("app/auctions/AuctionsClient.tsx"));
  assert.doesNotMatch(auc, /imminent|ongoing/, "임박 · 진행 미리보기 묶음 없음(목록 윗줄과 같은 물건)");
  assert.match(auc, /<section className="rise-in-4 card p-\[var\(--pad-card\)\] md:hidden" aria-label="진행·예정 물건">/);
  assert.match(auc, /\{cards\.slice\(0, rowCap\)\.map\(\(c\) => \(\s*<AuctionLine key=\{c\.key\} c=\{c\} \/>/);
  assert.match(auc, /<div data-tone="sand" className="max-md:hidden"><HScroll/);
  const news = strip(read("app/town/news/[id]/page.tsx"));
  assert.match(news, /<details aria-label="자주 묻는 질문" className="group flex flex-col gap-3 border-t border-divider pt-4">/);
  assert.ok(!strip(read("app/apply/ApplyDailyStrip.tsx")).includes("날짜별 캘린더 ›"));
  for (const [p, s] of [
    ["app/api/cron/economy-alerts/route.ts", "계산해 보세요"],
    ["lib/ai/next-action-routing.ts", "점검해 보세요"],
    ["lib/inspection/deep-dive.ts", "확인해 보세요"],
  ] as const) assert.ok(!read(p).includes(s), `${p} ${s}`);
});
