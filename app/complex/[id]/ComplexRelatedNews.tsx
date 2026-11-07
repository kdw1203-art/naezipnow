import Link from "@/app/components/IntentLink";
import { loadRelatedNews, withSectionBudget, type HubNewsRow } from "./section-loaders";

/* [1108 · 단지 상세 A안] 관련 기사 — 예전 ComplexNotesNewsAi 의 오른쪽 칸. "동네" 묶음(관련 기사 → 인근 단지 → 정비사업 ·
   입주물량 → 전문가)의 첫 자리로 옮겼다(뉴스 · 동네 분리 1044 는 그대로 — 자동수집 기사는 이 칸, 사람 글은 기록 칸).
   세 블록 모두 **실제로 있는 것만**: 기사 0건이면 한 줄, 조회 실패도 한 줄(없음을 지어내지 않는다). */

export async function ComplexRelatedNews({ name, region }: { name: string; region: string }) {
  const news = await withSectionBudget(loadRelatedNews(name, region)).catch((): HubNewsRow[] => []);

  return (
    <section className="cv-auto rise-in-5 mt-6 max-md:mt-3" aria-labelledby="complex-news-title">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-1">
        <h2 id="complex-news-title" className="t-section text-ink">
          관련 기사
        </h2>
        {/* [1012 · 규칙 5] "더 보기" → 구체 대상(지역명) */}
        <Link href={`/town/news?region=${encodeURIComponent(region)}`} className="tap-line t-sub font-bold text-primary no-underline">
          {region} 뉴스 ›
        </Link>
      </div>
      {news.length === 0 ? (
        <p className="card m-0 rounded-2xl px-4 py-3.5 t-sub text-text-3">이 단지·지역 관련 기사 없음</p>
      ) : (
        <ul className="lq-panel flex list-none flex-col divide-y p-0" data-tone="blue">
          {news.map((n) => (
            <li key={n.id}>
              <Link href={n.href} className="press flex min-h-12 items-center gap-3 py-2 no-underline">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 t-body font-bold text-ink">{n.title}</span>
                  <span className="mt-0.5 block t-sub text-text-3">{[n.source, n.when].filter(Boolean).join(" · ") || "출처 미상"}</span>
                </span>
                <span aria-hidden="true" className="t-body text-text-3">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ComplexRelatedNews;
