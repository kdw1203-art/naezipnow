import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";
import {
  listAllSigunguCodes,
  ingestAptMasterBatch,
  pickStalestSigungu,
} from "@/lib/national-data/apartment-ingest";
import { logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 전국 공동주택 단지 마스터 적재 크론.
 *
 * 커서 테이블 없이 STATELESS 하게 전국을 순회한다. 매 실행마다 현재 시각으로
 * 시군구 슬라이스(12개)를 선택하므로, 여러 번의 실행에 걸쳐 전국을 커버한다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * 인증키 미설정 시 하위 API가 mock/empty 를 반환 → upserted:0, reason:"no-key".
 */
async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const codes = listAllSigunguCodes().map((c) => c.sigunguCd);
  const total = codes.length;

  const SLICE = 12;
  /* [971] 특정 시군구만 다시 훑는 문. 목록에 있는 코드만 받는다. */
  const forced = (url.searchParams.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => codes.includes(c))
    .slice(0, SLICE);

  /* [982] 순서를 **데이터가** 정한다 — 가장 오래 안 본 시군구부터.
     예전에는 시계로 골랐다(`floor(now/12h) % 22`). 하루 한 번 같은 시각에 도는
     크론에서는 이 값이 매일 2씩 올라가 짝수 슬라이스만 방문하고, 홀수 11개
     (≈132개 시군구)는 영원히 안 돌았다. 적재 로그가 그대로였다 —
     09-06 slice=0 · 09-07 slice=2 · 09-08 slice=4 · 09-09 slice=6.
     그 결과 2026-09-09 기준 대전 44일 · 광주 43일 · 인천 34일 · 경기 20일이 밀려 있었고,
     전남은 대장에 아예 없었다.
     신선도 조회가 실패하면(뷰 부재·DB 장애) 예전 시계 방식으로 떨어진다 —
     조회 실패를 빈 목록으로 바꾸면 크론이 아무 일도 안 하고 성공처럼 보인다. */
  let picked: string[] | null = null;
  if (forced.length === 0) picked = await pickStalestSigungu(SLICE);
  const idx =
    Math.floor(Date.now() / (1000 * 60 * 60 * 12)) % Math.ceil(total / SLICE);
  const batch =
    forced.length > 0
      ? forced
      : picked && picked.length > 0
        ? picked
        : codes.slice(idx * SLICE, idx * SLICE + SLICE);
  const order: "forced" | "stalest" | "clock" =
    forced.length > 0 ? "forced" : picked && picked.length > 0 ? "stalest" : "clock";

  const configured = isDataGoKrEncodingConfigured();
  const { sigungu, fetched, upserted, failed, empty, errors } = await ingestAptMasterBatch(batch);
  const mode: "live" | "mock" = configured ? "live" : "mock";

  /* F3/#147 — 적재 로그(신선도 대시보드·운영 추적용).
     이전 버전은 status 가 skipped/ok 둘 중 하나밖에 될 수 없었다. 적재 함수가
     모든 오류를 삼키고 카운트만 돌려줬기 때문이다. 그래서 #150 이전의 "없는
     테이블에 쓰기" 실패가 로그상으로는 매번 '키 없음으로 건너뜀' 과 구별되지
     않았다. 이제 failed 를 올려 받아 error 를 낼 수 있다. */
  /* [971] "변경 0건" 은 건너뛴 게 아니라 **이미 최신**이라는 성공이다. 예전에는
     인증키 미설정과 똑같이 skipped 로 적혀서, 대장이 다 채워진 뒤로는 매일 같은
     줄만 쌓였다 — 그 사이에 읽기 자체가 0 인 시군구가 묻혔다. 이제 읽은 수를
     따로 세서, 못 읽은 것(error)과 바꿀 게 없던 것(ok)을 나눈다. */
  const status =
    failed > 0 ? "error" : !configured ? "skipped" : fetched > 0 ? "ok" : "error";
  const where =
    order === "forced"
      ? `지정=${forced.join(",")}`
      : order === "stalest"
        ? `오래된순=${batch.length}곳`
        : `slice=${idx}/${Math.ceil(total / SLICE)}(신선도 조회 실패로 시계 순환)`;
  const slice = `${where} 시군구=${sigungu} 읽음=${fetched} 변경=${upserted}`;
  const emptyNote = empty.length > 0 ? ` · 빈 시군구=${empty.join(",")}` : "";
  await logIngest({
    source: "apt-master",
    dataset: "전국 공동주택 단지 마스터",
    origin: "cron-fetch",
    rows: upserted,
    status,
    message: !configured
      ? "data.go.kr 인증키 미설정"
      : failed > 0
        ? `${slice} 실패=${failed}행${emptyNote}${errors.length > 0 ? ` · ${errors.join(" / ")}` : ""}`
        : fetched === 0
          ? `${slice} — 한 행도 못 읽었습니다(API 응답 확인 필요)${emptyNote}`
          : `${slice}${emptyNote}`,
  });

  return NextResponse.json({
    ok: failed === 0,
    slice: forced.length > 0 ? null : idx,
    sigungu,
    fetched,
    upserted,
    mode,
    total,
    batch,
    ...(empty.length > 0 ? { empty } : {}),
    ...(failed > 0 ? { failed, errors } : {}),
    ...(upserted === 0 && !configured ? { reason: "no-key" } : {}),
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
