/* [1063] 전체 디자인·글자 크기·표·그래프·액션 — 소유자 지시 "디자인 개선 및 글자크기 간결화, 표 및 그래프, 액션 적극 활용 ·
 * 모바일·데스크탑 고려". 잠그는 사실:
 *  V1 글자 크기 — 사용자 화면(관리자·임베드 제외)의 임의 px 글자 크기를 램프 유틸로 옮겼다(남은 수 상한).
 *  V2 데이터 화면 — 입주 물량·공매·정비사업은 머리 숫자 + 비율 막대 + 접힌 기준·출처.
 *  V3 액션 — 화면마다 눈에 띄는 주 단추 하나(폰 40px) · 목록 줄도 40px 탭 면.
 *  V4 사실 보존 — 문장·수치·법정 문구는 지우지 않고 자리만 옮겼다(표본).
 *  V5 모바일·데스크톱 — 막대는 단위를 적고, 줄의 값은 줄어들지 않는다(shrink-0). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

/** app/ 아래 .tsx 전부 — 관리자(운영 전용)·임베드/위젯(바깥 iframe)은 뺀다 */
function userFacingTsx(dir = "app", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p === "app/admin" || p === "app/embed" || p === "app/widget") continue;
      userFacingTsx(p, out);
    } else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("V1 글자 크기 — 사용자 화면의 임의 px 는 램프 유틸로(남은 수 상한 70)", () => {
  const files = userFacingTsx();
  let literals = 0;
  const worst: Array<[string, number]> = [];
  for (const f of files) {
    const n = (read(f).match(/text-\[\d+(?:\.\d+)?px\]/g) ?? []).length;
    if (n > 0) worst.push([f, n]);
    literals += n;
  }
  worst.sort((a, b) => b[1] - a[1]);
  /* 1062 기준 618곳 → 1063 에서 34곳. 남은 것은 굵기가 달라 기계적으로 못 바꾸는 자리(굵지 않은 15px 등)다.
     래칫: 이 수가 늘면 실패한다(줄면 상한을 내린다). */
  assert.ok(literals <= 40, `임의 px ${literals}곳 — 상한 40 · 많은 순 ${JSON.stringify(worst.slice(0, 5))}`);
  /* 1063 에서 손본 화면에는 하나도 남기지 않았다 */
  for (const f of [
    "app/payment/success/page.tsx",
    "app/search/UnifiedSuggestPanel.tsx",
    "app/listings/[id]/page.tsx",
    "app/region/[id]/page.tsx",
    "app/reports/[ym]/page.tsx",
    "app/supply/page.tsx",
    "app/auctions/AuctionsClient.tsx",
    "app/redevelopment/page.tsx",
  ]) {
    assert.doesNotMatch(read(f), /text-\[\d+(?:\.\d+)?px\]/, `${f} 임의 px`);
  }
});

test("V2 데이터 화면 — 머리 숫자 · 비율 막대 · 접힌 기준·출처", () => {
  for (const f of ["app/supply/page.tsx", "app/auctions/AuctionsClient.tsx", "app/redevelopment/page.tsx", "app/reports/[ym]/page.tsx", "app/region/[id]/page.tsx"]) {
    const src = code(f);
    assert.match(src, /<MiniBar/, `${f} 비율 막대`);
    assert.match(src, /unit=/, `${f} 막대 단위`);
    assert.match(src, /<Fineprint/, `${f} 기준·출처 접기`);
  }
  /* 막대는 실측에서 온다 — 상수 배열을 그려 넣지 않는다(값이 식에서 와야 한다) */
  for (const f of ["app/supply/page.tsx", "app/redevelopment/page.tsx", "app/reports/[ym]/page.tsx"]) {
    assert.match(code(f), /rows=\{[A-Za-z_]/, `${f} 막대 값은 계산된 배열`);
  }
});

test("V3 액션 — 주 단추 하나 · 폰 40px", () => {
  const ONE: Array<[string, number]> = [
    ["app/supply/page.tsx", 1],
    ["app/auctions/AuctionsClient.tsx", 1],
    ["app/redevelopment/page.tsx", 1],
    ["app/reports/[ym]/page.tsx", 1],
    ["app/region/[id]/page.tsx", 1],
    ["app/listings/[id]/page.tsx", 1],
  ];
  for (const [f, max] of ONE) {
    const n = (code(f).match(/btn-primary/g) ?? []).length;
    assert.ok(n <= max, `${f} btn-primary ${n}개 — 화면당 ${max}개`);
    assert.ok(n >= 1, `${f} 주 단추 없음`);
    /* 폰에서 40px — 단추든 줄이든 */
    assert.match(code(f), /min-h-\[40px\]/, `${f} 폰 40px`);
  }
});

test("V4 사실 보존 — 문장·수치·법정 문구는 자리만 옮긴다", () => {
  const samples: Array<[string, string]> = [
    ["app/supply/page.tsx", "청약홈"],
    ["app/auctions/AuctionsClient.tsx", "한국자산관리공사"],
    ["app/redevelopment/page.tsx", "정비사업"],
    ["app/reports/[ym]/page.tsx", "단순 평균"],
    ["app/listings/[id]/page.tsx", "국토교통부 실거래가"],
    ["app/region/[id]/page.tsx", "열린데이터광장"],
  ];
  for (const [p, s] of samples) assert.ok(read(p).includes(s), `${p} 에 "${s}" 가 남아 있어야 한다`);
});

test("V5 모바일·데스크톱 — 값 칸은 줄어들지 않고, 줄은 가로로 넘치지 않는다", () => {
  const bar = code("app/components/compact/MiniBar.tsx");
  assert.match(bar, /w-full/);
  assert.match(bar, /truncate/);
  /* 목록 줄: 왼쪽 이름은 min-w-0 로 줄고 오른쪽 값은 shrink-0 로 버틴다(390px 에서 값이 잘리지 않게) */
  for (const f of ["app/supply/SupplyClient.tsx", "app/auctions/AuctionsClient.tsx"]) {
    const src = code(f);
    assert.match(src, /shrink-0/, `${f} 값 칸 고정`);
    assert.match(src, /min-w-0/, `${f} 이름 칸 축소`);
  }
});
