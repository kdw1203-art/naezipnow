import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { listTemplates } from "@/lib/note-templates/store";
import { TemplateBrowser } from "./TemplateBrowser";

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 템플릿 목록은 코드 배포로만 바뀐다. */
/* [1010] 3600초 → 1일. 바뀌는 지점은 둘뿐이고 둘 다 비운다 — 템플릿 등록
   (POST /api/notes/templates)과 "N회 사용"(use_count) 증가(노트 저장 시
   app/api/inspection/notes/route.ts → invalidateNoteTemplateRoutes). */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "임장 노트 템플릿 | 내집나우",
  description:
    "입지·채광·소음·주차·하자부터 분양권·전월세·재건축까지, 임장 가기 전날 고르는 체크리스트 템플릿. 고르면 그 항목이 채워진 임장 노트가 열려요.",
  robots: { index: true, follow: true },
};

export default async function NoteTemplatesPage() {
  const items = await listTemplates();

  return (
    <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title="임장 노트 템플릿">
      {/* [1012] 규칙 5·6 — "검증된 체크리스트로 시작하세요"(금지 문구) → 언제·어디서 + 실제 템플릿 수.
          [1015 · 규칙 B·D] 사용법 문장("~고르면 그 항목이 채워진 노트가 열려요")은 걷고 숫자 한 줄만. 0건이면 숫자 없이. */}
      <p className="rise-in mb-5 t-body text-text-2 max-md:mb-3">
        {items.length > 0 ? `임장 전날 고르는 체크리스트 ${items.length}개` : "체크리스트 없음"}
      </p>
      <TemplateBrowser initial={items} />
    </PageShell>
  );
}
