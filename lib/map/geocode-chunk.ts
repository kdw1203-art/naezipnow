/**
 * 지오코딩 조회를 쪼개는 규칙 + PostgREST 오류 문구 — 순수 함수.
 *
 * [1003] 왜 따로 있나: complex-geocode.ts · supply-geocode.ts 는 `server-only` 라
 * node:test 로 못 읽는다(geocode-query.ts 를 뗀 것과 같은 이유). 두 파일이 똑같은
 * 규칙을 쓰므로 판단만 여기 모아 두고 양쪽에서 가져다 쓴다.
 *
 * ── 2026-09-17 사고 ────────────────────────────────────────────────────────────
 * 매일 도는 Market ETL 이 `failed: supply(200)` 으로 죽었다. supply-ingest 자체는
 * 200 이었고, 본문에 이 한 줄이 실려 있었다:
 *     "geocode":{"error":"complex_geocode 조회 실패: "}   ← 콜론 뒤가 비었다
 * 원인은 **URL 길이**였다. 실측(당일 프로덕션): apartment_supply 600행에서
 * 지역 17곳 · 단지명 582개(한글 9,140자). `.in("complex_name", […582개])` 는
 * PostgREST 에서 쿼리스트링으로 나가는데, 한글 1자는 UTF-8 3바이트 →
 * 퍼센트 인코딩하면 9바이트다. 9,140자 × 9 ≈ **82KB** 짜리 GET 이 된다.
 * 프런트(nginx/Kong)의 요청 라인 상한(보통 8KB)에 걸려 PostgREST 응답이 아닌 것이
 * 돌아오고, supabase-js 는 message 가 **빈 문자열**인 오류 객체를 만든다 —
 * 그래서 사유 없는 한 줄만 남았고, 백필은 몇 달째 아무 일도 하지 않고 있었다.
 *
 * 그래서 이 파일이 두 가지를 정한다: (1) 몇 개씩 끊어 부를지, (2) 오류를 어떻게
 * 적을지. 특히 (2) 는 **빈 문자열을 절대 돌려주지 않는다** — 다음에 같은 일이
 * 생기면 오류가 스스로 이름을 대야 한다(키 몇 개를 싣고 실패했는지 포함).
 */

/**
 * 한 번의 `.in()` 에 실을 단지명 개수.
 *
 * 계산(위 실측값 기준):
 *   · 이름 1개 ≈ 15.7자(9,140 ÷ 582) × 9바이트 ≈ 141바이트 + 구분자 → **142바이트**
 *   · 지역 1개 ≈ 50바이트("서울 강남구" = 한글 5자 + 공백 → 5×9 + 3 + 1)
 *   · 기본 경로 + select + 나머지 필터 ≈ 200바이트
 * 예산은 요청 URL 전체 **8KB 미만**(nginx/Kong 기본 요청 라인 상한 4×8k).
 *   30×142 + 60×50 + 200 ≈ 7,460 바이트
 * 실제로 만들어 재 본 값(@supabase/supabase-js 로 URL 생성, 16자 이름 기준):
 *   이름 30 · 지역 60 → 7,521B   이름 30 · 지역 30 → 6,051B
 *   이름 30 · 지역 17 → 5,414B   (옛 방식: 582 · 17 → 86,558B ← 이게 잘렸다)
 * 80개로 하면 이름 쪽만 11KB 라 상한을 넘는다. 그래서 30이다.
 *
 * 왕복 수: supply 크론은 582개 → 20회, 지도 경로(1,500행)라도 ~47회. 조각마다
 * PK 인덱스를 타는 조회라(아래 regionsByName 참고) 하루 1회 크론·1시간 캐시
 * 라우트에서는 문제되지 않는다.
 */
export const NAME_IN_CHUNK = 30;

/**
 * 한 조각에 실을 지역 개수 상한(≈50바이트 × 60 = 3KB — 위 예산에 넣어 둔 몫).
 * 조각의 지역 수는 보통 이름 수(30)를 넘지 않으니 이 값은 사실상 안전핀이다.
 * 그래도 넘으면 그 조각만 지역 필터를 **뺀다**(느려도 틀리지는 않는다). 결과는
 * 같다: 세 호출부 모두 돌아온 행을 (지역, 단지명) 짝으로 다시 거르기 때문이다.
 */
export const REGION_IN_MAX = 60;

/**
 * 이름 → 그 이름이 실제로 붙어 있는 지역들.
 *
 * 왜 짝을 기억하나: complex_geocode 의 PK 는 (region_name, complex_name) 이고
 * complex_name 단독 인덱스는 없다(2026-08-02 에 정리됐다). 지역 필터를 통째로
 * 빼면 조각마다 32,000행 seq scan 이 된다(실측 64ms/회). 그래서 조각마다
 * "그 이름들의 지역만" 실어 보낸다 — URL 은 짧게 유지하면서 PK 인덱스는 계속 탄다.
 */
export function regionsByName(
  pairs: readonly { region: string; name: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of pairs) {
    const cur = out.get(p.name);
    if (!cur) out.set(p.name, [p.region]);
    else if (!cur.includes(p.region)) cur.push(p.region);
  }
  return out;
}

/**
 * 목록을 size 개씩 끊는다. 순서는 유지하고, 마지막 조각만 짧을 수 있다.
 * size 가 1 미만이면 1로 본다 — 0 을 그대로 쓰면 무한 루프가 된다.
 */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const step = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 1;
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
  return out;
}

/** supabase-js(PostgREST)가 돌려주는 오류 모양 — 네 칸 모두 비어 있을 수 있다. */
export type PgErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

const UNKNOWN = "알 수 없는 오류";

/**
 * PostgREST 오류를 사람이 읽는 한 줄로. **절대 빈 문자열을 돌려주지 않는다.**
 *
 * `error.message` 만 찍던 코드가 2026-09-17 에 "complex_geocode 조회 실패: " 라는
 * 사유 없는 문장을 남겼다(위 사고). 프록시가 요청을 자르면 message 가 빈 문자열로
 * 오기 때문이다. 그래서 code·details·hint 까지 긁어 붙이고, 그래도 아무것도 없으면
 * "알 수 없는 오류" 라고 적는다.
 *
 * @param keyCount 그 요청이 싣고 있던 키 개수(부르는 쪽이 알 때만). URL 길이로
 *   죽는 사고는 이 숫자가 있어야 로그만 보고 바로 알아볼 수 있다.
 */
export function pgErrorText(e: PgErrorLike, keyCount?: number): string {
  const parts: string[] = [];
  const add = (v: string | null | undefined, prefix = "") => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) parts.push(`${prefix}${s}`);
  };
  add(e?.message);
  add(e?.code, "code=");
  add(e?.details);
  add(e?.hint);
  const head = parts.length > 0 ? parts.join(" · ") : UNKNOWN;
  return typeof keyCount === "number" && Number.isFinite(keyCount)
    ? `${head} (키 ${Math.trunc(keyCount)}개)`
    : head;
}
