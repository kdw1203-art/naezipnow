import { NextResponse, type NextRequest } from "next/server";
import { captureException } from "@/lib/monitoring/capture";
import { BUILD_MARK, normalizeBuildMark } from "@/lib/monitoring/build-mark";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * G10: 클라이언트에서 발생해 error.tsx 로 잡힌 예외를 서버 모니터링 싱크로 전달한다.
 * lib/monitoring/capture 는 server-only 라 클라이언트에서 직접 부를 수 없어 이 경유지가 필요하다.
 * 저장소에 쓰지 않고 캡처만 하므로 실패해도 사용자 흐름에 영향이 없다.
 *
 * [1027 · 제안 28] 화면 쪽 정보를 남긴다.
 * 예전에는 문구만 받아 여기서 `new Error(문구)` 를 만들었다 — 저장된 스택은 이 수신부(서버)의 것이라
 * 브라우저에서 무엇이 터졌는지 남지 않았다(운영 ops.error_log 의 client 행은 전부 이 파일을 가리켰다).
 *  · 브라우저 스택·오류 이름을 받아 그대로 저장한다(스택이 없으면 서버 스택을 넣지 않는다 — 틀린 단서보다 빈 칸).
 *  · 빌드 표식: 그 탭이 받은 빌드(build — <meta name="nz-build">)와 지금 받은 서버의 빌드(serverBuild — 같은 방식으로
 *    빌드 때 박힌 값)·배포 번호. 둘이 다르면 "배포 뒤 옛 탭"이다. 탭 쪽 값은 브라우저가 보낸 글자라 형식만 확인한다.
 *  · 주소는 경로만 — ?뒤는 버린다(결제 완료 주소처럼 열쇠가 실리는 화면이 있다).
 * 인증 없는 수신부라 도배만 막는다(본문 16KB · 분당 30건).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  message?: unknown;
  name?: unknown;
  stack?: unknown;
  digest?: unknown;
  path?: unknown;
  scope?: unknown;
  build?: unknown;
};

const MAX_BODY_CHARS = 16_000;

const s = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(req: NextRequest): Promise<Response> {
  const rl = rateLimit(`client-error:${getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Payload;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) {
      return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
    }
    body = JSON.parse(text) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const message = s(body.message, 500);
  if (!message) {
    return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
  }

  const err = new Error(message);
  const name = s(body.name, 80);
  if (name) err.name = name;
  /* 브라우저 스택만 저장한다. 없으면 비운다(여기서 만든 Error 의 서버 스택은 원인이 아니다) */
  err.stack = s(body.stack, 4000) ?? undefined;

  captureException(err, {
    source: "client",
    scope: s(body.scope, 32) ?? "error-boundary",
    digest: s(body.digest, 64),
    path: s(body.path, 256)?.split(/[?#]/)[0] ?? null,
    name,
    build: normalizeBuildMark(s(body.build, 40)) || null,
    serverBuild: BUILD_MARK || null,
    serverDeploy: (process.env.VERCEL_DEPLOYMENT_ID ?? "").trim().slice(0, 64) || null,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 256) || null,
  });

  return NextResponse.json({ ok: true });
}
