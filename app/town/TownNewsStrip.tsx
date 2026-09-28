import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import type { NewsRow } from "@/lib/town/news-row";
import { CoverImage } from "@/app/components/CoverImage";

/* ============================================================
   [1006] "오늘의 뉴스" 스트립 — 동네이야기(/town)·동네 홈(/town/[region])에 놓이는
   뉴스룸 입구. 서버 조각(상태 없음).

   피드 카드(사람의 기록) 사이에 뉴스 카드를 섞지 않는다. 대신 한지 면 + 왼쪽 네이비
   선의 **다른 재질**로 제목 3~5개를 한 줄씩(출처 · 시각) 보여 주고 뉴스룸으로 보낸다.
   기사가 0건이면 스트립 자체를 그리지 않는다 — 빈 상자로 자리를 밀지 않는다.
   ============================================================ */
export function TownNewsStrip({
  rows,
  title = "오늘의 뉴스",
  href = "/town/news",
  max = 4,
  className = "",
  showHeader = true,
}: {
  /** 최신순 뉴스 행(이미 손에 든 목록 — 여기서 새로 조회하지 않는다) */
  rows: NewsRow[];
  /** 머리 라벨 — 동네 홈은 "{동네} 뉴스" 로 바꿔 쓴다 */
  title?: string;
  /** 뉴스룸으로 가는 링크(지역 필터 딥링크 가능) */
  href?: string;
  max?: number;
  className?: string;
  /** 바깥에 이미 섹션 제목이 있으면(동네 홈) 스트립 안 머리줄을 생략한다 */
  showHeader?: boolean;
}) {
  const items = rows.slice(0, Math.max(1, max));
  if (items.length === 0) return null;
  return (
    /* [1015 · 규칙 C·K] 한지 스트립(튀는 색면) → 흰 카드. 제목 옆 "뉴스룸 · 자동 수집" 부연 삭제(소유자 지시).
       행 = 원문 사진(있을 때만) + 제목 + 매체 · 시각 — 뉴스는 원문 사진을 그대로 쓴다(템플릿 썸네일 아님). */
    <section className={`card rise-in rounded-2xl px-4 py-3 max-md:px-3.5 ${className}`} aria-label={title}>
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 inline-flex items-center gap-1.5 t-section text-ink">
            <Icon name="newspaper" size={14} />
            {title}
          </h2>
          <Link
            href={href}
            className="inline-flex min-h-[24px] items-center gap-0.5 t-sub font-bold text-primary no-underline"
          >
            뉴스룸 전체
            <span aria-hidden="true">›</span>
          </Link>
        </div>
      )}
      <ul className={`m-0 flex list-none flex-col divide-y divide-line p-0 ${showHeader ? "mt-1" : ""}`} data-tone="plain">
        {items.map((r) => (
          <li key={r.id}>
            <Link href={`/town/news/${r.id}`} className="flex items-center gap-3 py-2 no-underline">
              {r.image && (
                <span className="relative h-[48px] w-[64px] shrink-0 overflow-hidden rounded-lg bg-divider">
                  <CoverImage src={r.image} alt="" sizes="64px" imgClassName="absolute inset-0 h-full w-full object-cover" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate t-body font-bold text-ink">{r.title}</span>
                <span className="flex min-w-0 items-baseline t-caption text-text-3">
                  {r.source && <span className="min-w-0 truncate font-bold text-text-2">{r.source}</span>}
                  <time dateTime={r.publishedAt} className="shrink-0 whitespace-pre">
                    {r.source ? " · " : ""}
                    {r.timeLabel}
                  </time>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
