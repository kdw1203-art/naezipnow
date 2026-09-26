/**
 * [1009 · T] 계산 화면의 금액 표기 — 순수 함수(단위검증: tests/unit/calc-1009.test.ts).
 *
 * 왜(2026-09-22 실측): 계산기 두 파일이 같은 일을 하는 지역 포맷터를 따로 들고 있었다 —
 * calculator-client.tsx formatEok("12억 4,500만원", 0 → "0원", 음수 → "0원")와 realestate-tools.tsx formatEok
 * (음수 → "-1억 2,000만원"), 월세는 또 다른 formatMan1("183.3만원" — 만원 소수), 중개보수는 krw("3,360,000원").
 * 사이트 표준(lib/format/eok-man.ts formatEokMan, 네이버 부동산·토스 표기)을 본체로 쓰고, 계산 화면에만 필요한
 * 두 가지 — 0·음수(차액·부족분)와 원 단위 금액(월세·중개보수) — 만 여기서 더한다.
 *
 *   manwonText(124500)          → "12억 4,500만원"
 *   manwonText(0)               → "0원"
 *   manwonText(-2400)           → "−2,400만원"
 *   wonText(1_833_333)          → "183만 3,333원"   (토스 송금 표기)
 *   wonText(3_360_000)          → "336만원"
 */
import { formatEokMan } from "@/lib/format/eok-man";

/** 만원 → "12억 4,500만원"(unit "만원", 기본) · "12억 4,500만"(unit "만"). 0 → "0원", 음수는 앞에 "−". 반올림. */
export function manwonText(manwon: number, unit: "만" | "만원" = "만원"): string {
  if (!Number.isFinite(manwon)) return "—";
  const r = Math.round(manwon);
  if (r === 0) return unit === "만원" ? "0원" : "0";
  const body = formatEokMan(Math.abs(r), { unit });
  return r < 0 ? `−${body}` : body;
}

/** 원 → 억·만·원 세 토막 — "1억 2,345만 6,789원" · "336만원" · "9,800원". 0 → "0원", 음수는 "−". 반올림. */
export function wonText(won: number): string {
  if (!Number.isFinite(won)) return "—";
  const r = Math.round(won);
  if (r === 0) return "0원";
  const a = Math.abs(r);
  const eok = Math.floor(a / 100_000_000);
  const man = Math.floor((a % 100_000_000) / 10_000);
  const rest = a % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest > 0) parts.push(rest.toLocaleString("ko-KR"));
  const body = `${parts.join(" ")}원`;
  return r < 0 ? `−${body}` : body;
}

/** 원 → 억·만·원 토막(큰 숫자 타이포용). 0·음수·NaN 이면 null */
export function wonParts(won: number): { eok: number; man: number; rest: number } | null {
  if (!Number.isFinite(won) || won <= 0) return null;
  const a = Math.round(won);
  return { eok: Math.floor(a / 100_000_000), man: Math.floor((a % 100_000_000) / 10_000), rest: a % 10_000 };
}

/** 비율(0~1) → "38%" · 1% 미만은 "0.4%" (구성 막대 범례) */
export function shareText(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  const pct = ratio * 100;
  if (pct < 1) return `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * 여러 칸의 비율 → 합이 정확히 100% 인 글자들(구성 막대 범례).
 * [1009 · T 리뷰] 칸마다 따로 반올림하면 합이 100 이 아니었다(1억·생애최초·그 외 지역 → 70% + 30% + 0.5% = 100.5% —
 * 가능한 조합의 약 15%). 최대 잔여법(Hamilton)으로 나눠 준다. 0 보다 크고 1% 미만인 칸이 있으면 모든 칸을 소수 한
 * 자리(0.1% 단위)로 — 작은 칸이 "0%"로 사라지지 않게. 값이 있는 칸은 적어도 한 단위를 받는다. 0 인 칸은 "0%".
 */
export function shareTexts(values: readonly number[]): string[] {
  const v = values.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum <= 0) return v.map(() => "0%");
  const fine = v.some((x) => x > 0 && (x / sum) * 100 < 1);
  const scale = fine ? 1000 : 100;
  const exact = v.map((x) => (x / sum) * scale);
  const units = exact.map((e) => Math.floor(e));
  let left = scale - units.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .filter(({ i }) => v[i] > 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) units[order[k].i] += 1;
  /* 값이 있는데 0 단위가 된 칸 — 가장 큰 칸에서 한 단위를 옮긴다(합은 그대로) */
  for (let i = 0; i < v.length; i++) {
    if (v[i] > 0 && units[i] === 0) {
      const big = units.indexOf(Math.max(...units));
      if (big >= 0 && units[big] > 1) {
        units[big] -= 1;
        units[i] = 1;
      }
    }
  }
  return units.map((u) => (fine ? `${(u / 10).toFixed(1)}%` : `${u}%`));
}

/** 문장 속 금액이 줄 끝에서 "183만 / 3,333원"처럼 쪼개지지 않게 — 금액 안의 띄어쓰기를 붙는 공백(U+00A0)으로 */
export function nb(text: string): string {
  return text.replace(/ /g, "\u00a0");
}
