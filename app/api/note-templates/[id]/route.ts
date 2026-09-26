import { NextResponse } from "next/server";
import { getTemplate } from "@/lib/note-templates/store";

export const runtime = "nodejs";

/**
 * [1007] GET /api/note-templates/{id} → { template: { id, title, sections } } | 404
 *
 * 왜: /notes/new 가 `?tpl={id}` 를 서버에서 읽어 템플릿을 조회하던 것이 그 페이지를
 * force-dynamic 으로 만들던 원인 중 하나였다(하루 1,790회 함수 호출, 사람 방문 한 자릿수).
 * 정적 셸로 바꾸면서 템플릿은 작성기가 마운트 뒤 여기서 받는다. 응답은 폼이 쓰는
 * 세 필드(NoteFormTemplate)만 — 작성자 이메일 같은 열은 실지 않는다.
 * 판정은 예전 page.tsx 와 같다(getTemplate: 공식 상수 우선, 없으면 DB by id).
 * 캐시: 공식 템플릿은 코드 상수라 CDN 1시간, 사용자 템플릿은 공개 여부가 바뀔 수 있어 no-store.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tplId = (id ?? "").trim();
  if (!tplId || tplId.length > 120) {
    return NextResponse.json({ error: "템플릿 id 가 필요합니다." }, { status: 400 });
  }
  let t: Awaited<ReturnType<typeof getTemplate>>;
  try {
    t = await getTemplate(tplId);
  } catch {
    return NextResponse.json(
      { error: "템플릿을 지금 불러오지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
  /* [1007 · 리뷰 L2] 공식 또는 공개 템플릿만 — uuid 만 알면 남의 비공개 템플릿 본문을 받던 구멍(옛 ?tpl= 서버
     경로와 같은 노출)을 여기서 닫는다. 없음과 비공개를 구분하지 않는다(존재 여부 유출 방지). */
  if (!t || !(t.isOfficial || t.isPublic)) {
    return NextResponse.json(
      { error: "없음" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { template: { id: t.id, title: t.title, sections: t.sections } },
    {
      headers: {
        "Cache-Control": t.isOfficial
          ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      },
    },
  );
}
