/* [1051 · 홈 실시간 토론] 전체 토론 화면 — 홈 "실시간 토론" 칸의 큰 판(같은 TalkPanel · 목록·글을 더 길게).
   글은 클라이언트가 /api/talk 로 늘 새로 받는다(서버 HTML 에 사용자 글 없음 → 정적 한 벌). 검색 색인은 하지 않는다 —
   서버 HTML 에 본문이 없는 화면이라 얇은 문서로 잡힌다(ops.thin_content_check). */
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { TalkPanel } from "@/app/components/talk/TalkPanel";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "실시간 토론",
  description: "수도권 지역·단지 한 줄 토론 — 지역별 매매가격지수 전월비·매매 신고 순위와 지역 소식.",
  path: "/talk",
  noIndex: true,
});

export default function TalkPage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <PageHead icon="messages-square" title="실시간 토론" sub="수도권 지역 · 단지 한 줄 · 새 글 30초마다" />
        <section className="card rounded-2xl px-3.5 py-3.5 md:px-5 md:py-4">
          <TalkPanel variant="page" />
        </section>
      </div>
    </PageShell>
  );
}
