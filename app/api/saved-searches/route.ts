/**
 * /api/saved-searches
 *  - GET  : 현재 로그인 사용자의 저장 검색 목록 { items: SavedSearch[] } (비로그인 → [])
 *  - POST : 저장 검색 생성 (body { label, query?, scope?, filters? }) — 사용자당 30회/시간
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSavedSearch, listSavedSearches } from "@/lib/saved-search/store";
import { scopeActionUrl } from "@/lib/saved-search/alert-matcher";
import { isScope, type SavedSearchScope } from "@/lib/saved-search/types";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ items: [] });

  /* [1057 · B4] 저장소가 실패를 던진다 — 200 + [] 대신 503(화면은 지금 목록을 지우지 않고 "불러오기 실패"를 적는다).
     actionUrl = 알림이 눌렀을 때 가는 곳과 같은 주소(scopeActionUrl) — 목록의 "검색 열기" 링크. */
  try {
    const items = (await listSavedSearches(email)).map((s) => ({ ...s, actionUrl: scopeActionUrl(s.scope, s.query) }));
    return NextResponse.json({ items });
  } catch (err) {
    return dbUnavailable("saved-searches 목록 조회 실패", err, "저장한 검색 불러오기 실패 · 잠시 후 다시");
  }
}

export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rl = rateLimit(`saved-search:create:${email}`, {
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const label = String(b.label ?? "").trim();
  if (label.length < 1) {
    return NextResponse.json({ error: "검색 이름을 입력해 주세요." }, { status: 400 });
  }
  const query = String(b.query ?? "").trim();
  const scopeRaw = String(b.scope ?? "map").trim();
  const scope: SavedSearchScope = isScope(scopeRaw) ? scopeRaw : "map";
  const filters =
    b.filters && typeof b.filters === "object" && !Array.isArray(b.filters)
      ? (b.filters as Record<string, unknown>)
      : {};

  const alertEnabled = b.alertEnabled === true;
  const result = await createSavedSearch({ email, label, query, scope, filters, alertEnabled });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "저장에 실패했습니다." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
