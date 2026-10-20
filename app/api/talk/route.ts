import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { findBlockedWord } from "@/lib/community/moderation";
import { DUPE_WINDOW_MS, judgeFlood } from "@/lib/community/flood-guard";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { applyRateLimit, getClientIp, rateLimit, READ_RATE_LIMIT, tooManyRequests, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";
import { checkTalkBody, complexInRegion, talkAuthorLabel, talkBodyMessage, TALK_FLOOD_MAX, TALK_FLOOD_WINDOW_MS } from "@/lib/talk/rules";
import { talkRegionById } from "@/lib/talk/regions";
import { loadRegionFacts } from "@/lib/talk/board";
import { addRegionTalk, listRecentTalksByAuthor, listRegionTalks, softDeleteRegionTalk } from "@/lib/talk/store";
import { resolveDisplayName } from "@/lib/account/display-name";

export const runtime = "nodejs";

/* [1051 · 홈 실시간 토론] 지역(+단지) 한 줄 토론.
 *  GET    ?region=<id>[&complexId=<순수 id>]  — 그 지역 사람 글(최신 40) + 자동 소식(지수·거래·뉴스·임장노트). 누구나.
 *         [1057 · B8] complexId 를 주면 그 단지에 붙은 글만(단지 화면) — 자동 소식은 지역 단위라 싣지 않는다.
 *  POST   { regionId, body, complexId? } — 로그인. 금칙어 · 도배(24시간 같은 글 · 10분 10줄) · 계정당 분당 5건.
 *  DELETE { id } — 작성자 본인 · 관리자.
 * 글은 사람이 쓰는 즉시 보여야 한다 — GET 은 캐시하지 않는다(소식은 서버에서 10분 캐시).
 * 이메일은 응답에 싣지 않는다(내 글 표시는 mine 한 칸). */

function regionParam(req: NextRequest) {
  return talkRegionById(req.nextUrl.searchParams.get("region"));
}

export async function GET(req: NextRequest) {
  /* [1080] 폴링 경로에 상한이 없었다 — IP 당 분 60회(정상 폴링은 분 2회 이하 · KV 고정 창) */
  const limited = await applyRateLimit(req, { ...READ_RATE_LIMIT, keyFn: (r) => `talk-feed:${getClientIp(r)}` });
  if (limited) return limited;
  const region = regionParam(req);
  if (!region) return NextResponse.json({ error: "지역을 찾을 수 없어요." }, { status: 404 });
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  /* [1057 · B8] 단지 필터 — 저장된 complex_id(순수 id)와 글자 그대로 비교한다. 해독이 안 되는 값은 400 */
  const complexId = (req.nextUrl.searchParams.get("complexId") ?? "").trim() || null;
  if (complexId && !decodeComplexId(complexId)) return NextResponse.json({ error: "단지 id 가 올바르지 않아요." }, { status: 400 });
  if (complexId) {
    try {
      const posts = await listRegionTalks(region.id, email, 40, complexId);
      return NextResponse.json(
        { regionId: region.id, regionName: region.name, complexId, posts, facts: [], factsFailed: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      return dbUnavailable("region-talks(complex)", e);
    }
  }
  const [postsR, factsR] = await Promise.allSettled([listRegionTalks(region.id, email), loadRegionFacts(region.id)]);
  if (postsR.status === "rejected") return dbUnavailable("region-talks", postsR.reason);
  /* 소식 실패는 글 목록을 막지 않는다 — 소식 칸만 비고 화면이 "소식 불러오기 실패"를 적는다 */
  if (factsR.status === "rejected") logger.warn("[talk] 자동 소식 실패 — 글만", { region: region.id, message: String(factsR.reason) });
  /* [1052] 조각 실패(뉴스만 · 노트만)는 그 조각만 빠진다 — factsFailed 는 하나라도 빠졌을 때 */
  const facts = factsR.status === "fulfilled" ? factsR.value : null;
  if (facts && facts.failed.length > 0) logger.warn("[talk] 자동 소식 일부 실패", { region: region.id, failed: facts.failed.join(",") });
  return NextResponse.json(
    {
      regionId: region.id,
      regionName: region.name,
      posts: postsR.value,
      facts: facts?.facts ?? [],
      factsFailed: !facts || facts.failed.length > 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const rlUser = rateLimit(`region-talk:${email}`, { limit: 5, windowMs: 60_000 });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const region = talkRegionById(typeof b.regionId === "string" ? b.regionId : null);
  if (!region) return NextResponse.json({ error: "지역을 골라 주세요." }, { status: 400 });

  const checked = checkTalkBody(b.body);
  if (!checked.ok) return NextResponse.json({ error: talkBodyMessage(checked.reason) }, { status: 400 });
  const body = checked.body;

  /* 단지는 선택 — 단지 화면 주소의 id 를 해독해 이름·지역을 되살린다. 해독이 안 되거나 다른 지역 단지면 받지 않는다 */
  let complexId: string | null = null;
  let complexName: string | null = null;
  const rawComplex = typeof b.complexId === "string" ? b.complexId.trim() : "";
  if (rawComplex) {
    const decoded = decodeComplexId(rawComplex);
    if (!decoded) return NextResponse.json({ error: "단지를 다시 골라 주세요." }, { status: 400 });
    if (!region.txNames.some((n) => complexInRegion(decoded.region, n))) {
      return NextResponse.json({ error: `${region.name} 단지가 아니에요.` }, { status: 400 });
    }
    complexId = rawComplex;
    complexName = decoded.name.slice(0, 80);
  }

  const blocked = findBlockedWord(body);
  if (blocked) {
    return NextResponse.json(
      { error: `커뮤니티 이용 규칙에 어긋나는 표현(“${blocked}”) — 고쳐서 다시`, blockedWord: blocked },
      { status: 400 },
    );
  }

  try {
    const recent = await listRecentTalksByAuthor(email, new Date(Date.now() - DUPE_WINDOW_MS).toISOString());
    /* 같은 글 24시간 안 다시 쓰기는 커뮤니티 글과 같은 규칙(judgeFlood). 횟수는 토론답게 넉넉히 — 10분에 10줄 */
    const now = Date.now();
    const verdict = judgeFlood({ title: body, body }, recent, now);
    if (!verdict.ok && verdict.reason === "duplicate") {
      return NextResponse.json(
        { error: verdict.message, floodReason: verdict.reason },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
      );
    }
    const inWindow = recent.filter((r) => now - Date.parse(r.createdAt) < TALK_FLOOD_WINDOW_MS).length;
    if (inWindow >= TALK_FLOOD_MAX) {
      return NextResponse.json(
        { error: `10분에 ${TALK_FLOOD_MAX}줄까지 · 잠시 후 다시`, floodReason: "too_many" },
        { status: 429, headers: { "Retry-After": "120" } },
      );
    }
  } catch (e) {
    /* 글쓰기를 닫는 대가가 몇 건 새는 대가보다 크다 — 커뮤니티 글과 같은 판단 */
    logger.error("[talk] 도배 검사 조회 실패 — 통과시킴", e);
  }

  try {
    const post = await addRegionTalk({
      regionId: region.id,
      regionName: region.name,
      complexId,
      complexName,
      authorEmail: email,
      /* [1058] 세션 이름(로그인 때 굳은 공급자 이름)을 그대로 넣어 프로필에서 바꾼 이름이 새 글에 안 보였다 — app_users.name 먼저 */
      authorLabel: talkAuthorLabel(await resolveDisplayName(email, session?.user?.name), email),
      body,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (e) {
    logger.error("[talk] 저장 실패", e);
    return NextResponse.json({ error: "글 저장 실패 · 잠시 후 다시" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const id = String(b.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
  try {
    const r = await softDeleteRegionTalk(id, { email, isAdmin: isAdmin(session) });
    if (r === "forbidden") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    if (!r) return NextResponse.json({ error: "글을 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable("region-talk-delete", e);
  }
}
