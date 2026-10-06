/* [1012] 규칙 1·2 — 본문 카드 반경 12px→8px(rounded-3xl→rounded-lg 1곳). */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { getTemplate } from "@/lib/note-templates/store";
import { ARCHIVED_ROBOTS } from "@/lib/seo/archived-routes";

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다(x-vercel-cache: MISS, cache-control: private,no-store 실측). 이 화면의
   서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 — check-cache-policy 가
   회귀를 막는다). ISR 로 전환: 템플릿 본문은 코드 배포로만 바뀐다. */
/* [1010] 3600초 → 1일. 목록과 같은 쓰기 지점이 이 상세 경로도 같이 비운다
   (invalidateNoteTemplateRoutes(id) — 목록 + `/notes/templates/{id}`). */
export const revalidate = 86_400;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다(2026-08 complex/[id] 실측)
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tpl = await getTemplate(id);
  if (!tpl) {
    return { title: "템플릿 없음 | 내집나우" };
  }
  return {
    title: `${tpl.title} | 임장 노트 템플릿 | 내집나우`,
    description:
      tpl.description ||
      `${tpl.category} 임장 체크리스트. ${tpl.sections.length}개 섹션의 점검 항목이 채워진 임장 노트.`,
    robots: ARCHIVED_ROBOTS /* [1040] 보관 화면 — 예시 여부와 무관하게 색인 제외 */,
  };
}

export default async function NoteTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tpl = await getTemplate(id);

  if (!tpl) {
    return (
      <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title="템플릿 없음">
        <div className="card rise-in flex flex-col items-center gap-4 rounded-lg p-8 text-center">
          <Icon name="file-text" size={28} className="text-text-3" />
          <p className="t-body text-text-2">
            요청하신 템플릿이 없거나 비공개로 전환되었어요.
          </p>
          <Link
            href="/notes/templates"
            className="btn-primary press rounded-lg px-5 py-2.5 t-body font-bold no-underline"
          >
            템플릿 목록으로
          </Link>
        </div>
      </PageShell>
    );
  }

  const totalItems = tpl.sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title={tpl.title}>
      {/* 상단 배지 */}
      {/* [1012] 규칙 9 — 반짝이 아이콘 배지 → 사실 명사 배지(11px/500/4px). 숫자·카테고리는 글자로 */}
      <div className="rise-in mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {tpl.isOfficial && (
          <span className="inline-flex items-center rounded-sm bg-primary-soft px-1.5 py-px t-caption font-medium text-primary">
            내집나우 공식
          </span>
        )}
        <span className="t-sub text-text-3">
          {tpl.category} · {tpl.sections.length}개 섹션 · {totalItems}개 항목
        </span>
      </div>

      {tpl.description && (
        <p className="rise-in mb-5 t-body text-text-2">
          {tpl.description}
        </p>
      )}

      {/* 섹션 목록 */}
      <div className="flex flex-col gap-4">
        {tpl.sections.map((section, i) => (
          <section
            key={`${section.title}-${i}`}
            className="card rise-in-1 flex flex-col gap-3 rounded-lg p-5 max-md:gap-2 max-md:p-3.5"
          >
            <h2 className="flex items-center gap-2 t-section text-ink">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft t-sub font-bold text-primary">
                {i + 1}
              </span>
              {section.title}
            </h2>
            <ul className="flex flex-col gap-2">
              {section.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 t-body text-text-1">
                  <Icon
                    name="check"
                    size={15}
                    className="mt-0.5 shrink-0 text-primary"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* 태그 */}
      {tpl.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {tpl.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface px-2.5 py-1 t-sub text-text-3 border border-line"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/notes/new?tpl=${tpl.id}`}
          className="btn-primary press inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 t-body font-bold no-underline"
        >
          <Icon name="notebook-pen" size={17} />항목 {totalItems}개로 노트 쓰기
        </Link>
        <Link
          href="/notes/templates"
          className="press inline-flex items-center justify-center rounded-lg border border-line bg-surface px-6 py-3.5 t-body font-medium text-text-2 no-underline"
        >
          체크리스트 목록으로
        </Link>
      </div>

      {/* [#132] 이웃 템플릿 위생 — 신고 채널. 목록 정렬은 실사용 집계(use_count)가 이미 담당.
          전용 신고 큐는 공유 볼륨이 생기면(주 10건+) 모더레이션 체계로 승격한다. */}
      {!tpl.isOfficial && (
        <p className="mt-4 t-sub text-text-3">
          부적절한 내용(광고·비방·저작권)은{" "}
          <Link href={`/support?subject=${encodeURIComponent(`체크리스트 신고: ${tpl.title}`)}`} className="font-bold text-primary">
            고객센터로 신고
          </Link>
          . 확인 후 비공개 처리.
        </p>
      )}
    </PageShell>
  );
}
