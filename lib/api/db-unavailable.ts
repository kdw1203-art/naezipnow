/**
 * DB 조회 실패를 사용자에게 **사실대로** 옮기는 공통 응답.
 *
 * ── 왜 503 인가 ─────────────────────────────────────────────────────────────
 * 여기서 실패하는 건 요청이 아니라 DB 쪽이다. 그런데 이런 실패를 400 으로
 * 답하면 "네 요청이 잘못됐다"는 뜻이 되어 클라이언트가 재시도하지 않고,
 * 200 + 빈 값으로 답하면 "그런 데이터는 없다"는 **없는 사실**이 된다.
 * 503 + Retry-After 만이 실제로 일어난 일을 그대로 말한다: 지금은 못 주는데
 * 잠시 뒤엔 된다.
 *
 * 400/402/404 를 대신하지 않는다 — 그건 각각 요청이 잘못됐거나, 권한이
 * 없거나, 정말 없는 경우다. 이 함수는 오직 "조회가 실패했다"에만 쓴다.
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/log";

/** 재시도까지 권하는 간격(초). PGRST002 는 보통 이 안에 회복된다. */
const RETRY_AFTER_SECONDS = 30;

export function dbUnavailable(where: string, err: unknown, message?: string): NextResponse {
  /* [1007] DB 가 밀리는 몇 분 동안 이 줄이 **요청마다** 찍혔다(24h error 1,338 건의 주요
     반복 문장). 위치(where)별 1분 1건으로 접는다 — 첫 건은 그대로 나가고, 접힌 건수는
     다음 줄에 "(… n회 생략)" 으로 남는다(lib/log/sample.ts). 오류를 숨기는 게 아니라
     같은 사실의 300번째 반복을 줄이는 것이다. */
  logger.errorSampled(`db-unavailable:${where}`, `[db-unavailable] ${where}`, err);
  return NextResponse.json(
    { error: message ?? "지금은 처리할 수 없습니다. 잠시 후 다시 시도해 주세요." },
    { status: 503, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
  );
}
