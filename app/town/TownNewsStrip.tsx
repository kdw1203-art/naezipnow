import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import type { NewsRow } from "@/lib/town/news-row";

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
    <section
      className={`news-strip rise-in px-4 py-3 ${className}`}
      aria-label={title}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <span className="news-strip__label">
            <Icon name="newspaper" size={12} />
            {title}
            <span className="font-semibold tracking-normal text-text-3">
              뉴스룸 · 자동 수집
            </span>
          </span>
          <Link
            href={href}
            className="inline-flex min-h-[24px] items-center gap-0.5 t-sub font-bold text-primary no-underline"
          >
            뉴스룸 전체
            <span aria-hidden="true">›</span>
          </Link>
        </div>
      )}
      <div className={`flex flex-col ${showHeader ? "mt-1" : ""}`}>
        {items.map((r) => (
          <Link
            key={r.id}
            href={`/town/news/${r.id}`}
            className="news-strip__item"
          >
            {r.source && <span className="news-source">{r.source}</span>}
            <span className="news-title">{r.title}</span>
            <time
              dateTime={r.publishedAt}
              className="shrink-0 t-caption text-text-3"
            >
              {r.timeLabel}
            </time>
          </Link>
        ))}
      </div>
    </section>
  );
}
