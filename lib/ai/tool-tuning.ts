/**
 * 도구별 보정 입력 — **엔진이 실제로 읽는 필드만** 화면에 올린다.
 *
 * ── 왜 (2026-09-09) ────────────────────────────────────────────────────────
 * 워크벤치는 12종 전부에게 같은 입력 하나(가용 예산)와 체크박스 하나(AI 서술)만
 * 물었다. 그런데 lib/ai/analysis-engine.ts 는 도구마다 다른 입력을 이미 읽고 있다 —
 * `horizonMonths`·`watchList`(타이밍), `mustHaves`·`maxTravelMinutes`(동선),
 * `ltvPct`·`mortgageRatePct`(수익률), `maeMan`·`jeonMan`(갭), `jeonseMan`·
 * `marketRatioPct`·`hasRegistrationCheck`·`hasInsurance`(계약) 등.
 *
 * 즉 **기능이 없던 게 아니라 물어보지 않고 있었다.** 가장 뚜렷한 예가 갭투자
 * 진단이다 — 엔진은 `maeMan - jeonMan` 으로 갭을 계산하는데 화면이 두 값을
 * 물어보지 않으니 늘 0 이었다.
 *
 * ── 규칙 ───────────────────────────────────────────────────────────────────
 * ① **엔진이 읽지 않는 입력은 만들지 않는다.** 결과에 영향이 없는 입력칸은
 *    화면을 풍성해 보이게 만들 뿐 사용자를 속인다. 각 필드에 엔진의 어느 줄이
 *    읽는지 주석으로 남긴다.
 * ② 필수로 만들지 않는다. 비우면 엔진이 기본값으로 가고, 화면은 그 사실을
 *    말한다(placeholder 가 기본값을 적는다).
 * ③ 값 변환은 여기서 한 곳으로 모은다(`buildTuningInput`) — 화면이 문자열을
 *    직접 Number() 하면 도구마다 규칙이 갈라진다.
 *
 * ── 왜 파일이 둘인가 ───────────────────────────────────────────────────────
 * 12종의 필드 목록(lib/ai/tool-tuning-fields.ts)은 서버에서만 읽는다. 워크벤치가
 * 그 목록을 직접 import 하면 12종 문자열이 통째로 브라우저 번들에 실려
 * /analysis/ai/[tool] 이 483KB(예산 480)로 넘어갔다 — 실측. 지금은 서버가 **그 도구의
 * 필드만** 골라 내려주고, 여기(클라이언트가 함께 쓰는 쪽)에는 타입과 변환기만 둔다.
 */


export type TuningField =
  | {
      kind: "number";
      key: string;
      label: string;
      /** 단위 — 라벨 옆에 작게 */
      unit?: string;
      placeholder?: string;
      hint?: string;
    }
  | { kind: "text" | "textarea"; key: string; label: string; placeholder?: string; hint?: string }
  | {
      kind: "select";
      key: string;
      label: string;
      hint?: string;
      options: readonly { value: string; label: string }[];
    }
  | { kind: "toggle"; key: string; label: string; hint?: string };

/* 값이 숫자로 엔진에 들어가야 하는 키 — 문자열로 보내면 Number(…) 가
   빈 문자열을 0 으로 바꿔 "입력했다"로 오해된다. */
const NUMERIC_KEYS = new Set([
  "currentPriceMan",
  "areaPyeong",
  "horizonMonths",
  "maxTravelMinutes",
  "ltvPct",
  "mortgageRatePct",
  "loanTermYears",
  "holdingYears",
  "targetYieldPct",
  "maeMan",
  "jeonMan",
  "jeonseMan",
  "marketRatioPct",
]);

export function buildTuningInput(
  fields: readonly TuningField[],
  raw: Record<string, string | boolean | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (f.kind === "toggle") {
      out[f.key] = v === true;
      continue;
    }
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s === "") continue;
    if (NUMERIC_KEYS.has(f.key)) {
      /* 단위·기호가 섞여 들어와도 숫자를 뽑는다. 다만 숫자가 **하나도 없으면**
         보내지 않는다 — 걷어낸 뒤 남은 빈 문자열은 Number("") === 0 이라
         "0 을 입력했다"로 둔갑한다(빈 칸을 안 보내는 이유와 같은 함정). */
      const cleaned = s.replace(/[^\d.-]/g, "");
      if (!/\d/.test(cleaned)) continue;
      const n = Number(cleaned);
      if (Number.isFinite(n)) out[f.key] = n;
      continue;
    }
    out[f.key] = s;
  }
  return out;
}
