import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { uploadFile, recordUpload, UPLOAD_MAX_BYTES, ALLOWED_MIME_TYPES } from "@/lib/storage/upload";
import { getClientIp, requestRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

/* [1005 · A4] 업로드 한도 — 1분 30회, **계정(이메일)** 기준.
   예전엔 IP 기준 1분 10회였는데 작성 화면은 사진 10장을 허용한다. 10장을 고르면 예산이
   그 자리에서 다 소진돼, 한 장만 실패해도 재시도가 곧바로 429 였다(같은 공유기 뒤의 두
   사람이면 더 빨리). 30회면 10장 + 재시도 두 바퀴다. 키를 계정으로 잡는 이유: 업로드는
   로그인 필수라 정체가 분명하고, 카페·회사망처럼 IP 를 나눠 쓰는 사용자들이 서로의 예산을
   깎지 않는다. 비로그인 요청은 한도 전에 401 로 끝나 카운터를 안 건드린다. */
const UPLOAD_RATE_MAX = 30;
const UPLOAD_RATE_WINDOW_MS = 60_000;
const UPLOAD_RATE_MESSAGE = "사진 업로드가 잠시 많아요 — 1분 뒤 다시 시도해 주세요";

/**
 * POST /api/upload
 * Body: multipart/form-data  field "file"  (optional: field "folder")
 * Returns: { url, path, size, mime }
 */
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const identity = session.user.email.trim().toLowerCase() || getClientIp(req);
  const rate = await requestRateLimit(req, {
    max: UPLOAD_RATE_MAX,
    windowMs: UPLOAD_RATE_WINDOW_MS,
    keyFn: () => `rl:upload:${identity}`,
  });
  if (!rate.ok) {
    const retryAfterSec = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: UPLOAD_RATE_MESSAGE, retryAfterSec },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(UPLOAD_RATE_MAX),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
        },
      },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 요청이 필요합니다." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "'file' 필드가 없습니다." }, { status: 400 });
  }

  if (file.size > UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      { error: `파일 크기는 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `허용되지 않는 파일 형식입니다. (${ALLOWED_MIME_TYPES.join(", ")})` },
      { status: 415 },
    );
  }

  const folder = String(formData.get("folder") ?? "general").replace(/[^a-z0-9_-]/gi, "_").slice(0, 50);

  try {
    const result = await uploadFile(file, session.user.email, folder);
    await recordUpload({ ...result, uploaderEmail: session.user.email });
    return NextResponse.json({
      url: result.url,
      path: result.path,
      size: result.size,
      mime: result.mime,
      fallback: result.fallback,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "업로드 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/upload — 허용 타입/크기 정보 */
export async function GET(_req: NextRequest) {
  void WRITE_RATE_LIMIT;
  return NextResponse.json({
    maxSizeBytes: UPLOAD_MAX_BYTES,
    maxSizeMb: UPLOAD_MAX_BYTES / 1024 / 1024,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
}
