/**
 * [1079] GET /api/town/news/thumb/<id> — 뉴스 글의 원문 사진을 176×132 webp 썸네일로.
 *
 * 왜: 뉴스룸 목록은 매체 원본(1200px · 최대 3.3MB)을 64×48 칸에 그대로 받아 폰 한 번에 8.5MB 였다(운영 실측 2026-10-18).
 * 매체 호스트는 /_next/image 허용 밖(오픈 프록시 금지 규칙)이고 수집기는 DB 함수(코드 밖)라, 표시단이 **글 id** 로
 * 작은 그림을 받는 라우트를 둔다. 주소가 아니라 id 를 받으므로 남의 그림을 대신 받아 주지 않는다 — 글이 뉴스(자동 수집)이고
 * automation_meta 에 사진 주소가 있을 때만 그 주소 하나를 받는다.
 *
 * 응답: image/webp · CDN 30일(s-maxage) · 브라우저 1일. 원본을 못 받거나(차단·삭제·시간 초과·12MB 초과·이미지 아님)
 * 글이 없으면 404 — 표시단 CoverImage 가 onError 로 선 아이콘 칸으로 돌아간다(빈 상자 금지 규칙 그대로).
 * 404 도 CDN 1시간 캐시 — 죽은 원본을 매 조회마다 다시 두드리지 않는다.
 *
 * [1080] 두 겹 더 — ① KV 캐시(lib/kv/rest · 30일): CDN 미적중(리전·만료)마다 매체 서버를 다시 두드리던 것을 KV 에서 꺼낸다.
 *   죽은 원본도 6시간 기억한다. KV 가 없으면 종전대로. ② 끄기 스위치 `NEWS_THUMB_DISABLED=1` — 매체·저작권 문제가 생기면
 *   배포 없이 환경 변수만으로 전부 404(아이콘 칸)로 돌린다.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { applyRateLimit } from "@/lib/rate-limit";
import { getTownPost } from "@/lib/newui/board-posts";
import { isNewsPost } from "@/lib/town/news-list";
import { newsImageUrl } from "@/lib/town/shared";
import { isFetchableImageOrigin, NEWS_THUMB_H, NEWS_THUMB_ID_RE, NEWS_THUMB_W } from "@/lib/news/thumb";
import { kvGet, kvSet } from "@/lib/kv/rest";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 원본 한 장 상한 — 매체 og:image 가 3.3MB PNG 까지 실측됐다. 그 이상은 받지 않는다 */
const ORIGIN_MAX_BYTES = 12 * 1024 * 1024;
/** 원본 받기 시간 상한 */
const ORIGIN_TIMEOUT_MS = 8000;
/** 목록 한 장이 40행이라 한 사람이 1분에 40~80회 부른다(CDN 미적중 시) — 읽기 기본(60)보다 넉넉히 */
const THUMB_RATE_LIMIT = { max: 240, windowMs: 60_000 } as const;

const OK_CACHE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";
const MISS_CACHE = "public, max-age=600, s-maxage=3600";
/** [1080] KV 캐시 — 성공 30일 · 실패 6시간. 값은 webp base64(장당 3~12KB) · 실패는 "-" */
const KV_OK_SECONDS = 30 * 24 * 3600;
const KV_MISS_SECONDS = 6 * 3600;
const KV_MISS_MARK = "-";

/** Buffer → 독립 ArrayBuffer 위의 Uint8Array(Response 본문 타입) */
function toBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(buf.byteLength));
  out.set(buf);
  return out;
}

function miss(status = 404) {
  return new NextResponse(null, { status, headers: { "Cache-Control": MISS_CACHE } });
}

function webp(out: Uint8Array<ArrayBuffer>) {
  return new NextResponse(out, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(out.byteLength),
      "Cache-Control": OK_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function fetchOrigin(url: string): Promise<Buffer | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
    redirect: "follow",
    headers: {
      Accept: "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5",
      "User-Agent": "Mozilla/5.0 (compatible; naezipnow-thumb/1.0; +https://naezipnow.com)",
    },
  });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("image/")) return null;
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > ORIGIN_MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > ORIGIN_MAX_BYTES) return null;
  return buf;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (process.env.NEWS_THUMB_DISABLED?.trim() === "1") return miss();

  const limited = await applyRateLimit(req, THUMB_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!NEWS_THUMB_ID_RE.test(id)) return miss(400);

  const cacheKey = `news:thumb:v1:${id}`;
  const cached = await kvGet(cacheKey);
  if (cached === KV_MISS_MARK) return miss();
  if (cached) return webp(toBytes(Buffer.from(cached, "base64")));

  let origin: string | null = null;
  try {
    const post = await getTownPost(id);
    if (!post || !isNewsPost(post)) return miss();
    origin = newsImageUrl(post);
  } catch (e) {
    logger.error("[api/town/news/thumb] 글 조회 실패", e);
    return miss(503);
  }
  if (!origin || !isFetchableImageOrigin(origin)) return miss();

  try {
    const raw = await fetchOrigin(origin);
    if (!raw) {
      await kvSet(cacheKey, KV_MISS_MARK, KV_MISS_SECONDS);
      return miss();
    }
    const out = await sharp(raw, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(NEWS_THUMB_W, NEWS_THUMB_H, { fit: "cover", position: "centre" })
      .webp({ quality: 74 })
      .toBuffer();
    await kvSet(cacheKey, out.toString("base64"), KV_OK_SECONDS);
    return webp(toBytes(out));
  } catch (e) {
    /* 원본 차단·시간 초과·깨진 파일 — 경고만 남기고 404(표시단은 아이콘 칸) · 6시간은 다시 두드리지 않는다 */
    logger.warn("[api/town/news/thumb] 원본 변환 실패", { id, host: new URL(origin).hostname, err: String(e).slice(0, 120) });
    await kvSet(cacheKey, KV_MISS_MARK, KV_MISS_SECONDS);
    return miss();
  }
}
