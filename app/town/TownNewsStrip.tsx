import Link from "next/link";
import type { NewsRow } from "@/lib/town/news-row";

/* ============================================================
   [v4] /town 허브의 뉴스 입구 — **한 행**.

   소유자 지시(v4 "한 화면 한 가지"): 허브 첫 화면에 한지 스트립(제목 4줄 + "자동 수집" 배지 + 매체 열)이
   피드보다 먼저 크게 서 있어 "무엇을 봐야 하는지" 흐렸다. 허브에서는 1px 구분선 행 하나로 줄인다 —
   왼쪽 "오늘 뉴스 n건"(굵게) + 그 아래 첫 제목 한 줄 / 오른쪽 `›` → 뉴스룸(/town/news).
   n 은 손에 든 뉴스 목록에서 센 **오늘(KST) 기사 수**(countTodayKst) — 0 이면 행을 그리지 않는다.
   동네 홈(/town/[region])은 아래 TownNewsStrip — [v4] 전체 적용에서 같은 한 행으로 바꿨다.
   ============================================================ */
export function TownNewsRow({
  today,
  headline,
  href = "/town/news",
  className = "",
}: {
  /** 오늘(KST) 기사 수 — 0 이하면 행 자체가 없다 */
  today: number;
  /** 가장 최근 기사 제목(보조 한 줄) */
  headline: string | null;
  href?: string;
  className?: string;
}) {
  if (!Number.isFinite(today) || today <= 0) return null;
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 border-y border-line py-3 no-underline ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block t-body font-bold text-ink">
          오늘 뉴스 <span className="t-num">{today.toLocaleString("ko-KR")}</span>건
        </span>
        {headline && <span className="mt-0.5 block truncate t-sub text-text-3">{headline}</span>}
      </span>
      <span className="shrink-0 t-section text-text-3" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/* ============================================================
   [v4] 동네 홈(/town/[region])의 뉴스 입구 — 허브 TownNewsRow 와 **같은 한 행**.

   예전([1006])엔 한지 면 + 왼쪽 네이비 선의 "다른 재질" 스트립이었다(머리 라벨 + 신문 아이콘 + "자동 수집"
   배지 + "뉴스룸 전체 보기" + 매체 열·제목·시각 4~6줄). v4 규칙 6(설명 배지 삭제)·규칙 5(1px 구분선 행)로
   허브와 같은 모양이 된다 — 왼쪽 "{동네} 뉴스 n건"(굵게) + 그 아래 최신 제목 한 줄 / 오른쪽 `›` → 뉴스룸
   (지역 필터 딥링크). n 은 손에 든 행 수(같은 사건을 접은 뒤 — 뉴스룸 목록과 같은 단위). 0 이면 행이 없다.
   이름(TownNewsStrip)은 호출·테스트 호환으로 남긴다. 기사 목록은 뉴스룸이 맡는다(같은 사실은 한 번).
   ============================================================ */
export function TownNewsStrip({
  rows,
  title = "뉴스",
  href = "/town/news",
  className = "",
}: {
  /** 최신순 뉴스 행(이미 손에 든 목록 — 여기서 새로 조회하지 않는다) */
  rows: NewsRow[];
  /** 왼쪽 굵은 글자 — 동네 홈은 "{동네} 뉴스" */
  title?: string;
  /** 뉴스룸으로 가는 링크(지역 필터 딥링크 가능) */
  href?: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Link href={href} className={`flex items-center gap-3 border-y border-line py-3 no-underline ${className}`}>
      <span className="min-w-0 flex-1">
        <span className="block t-body font-bold text-ink">
          {title} <span className="t-num">{rows.length.toLocaleString("ko-KR")}</span>건
        </span>
        <span className="mt-0.5 block truncate t-sub text-text-3">{rows[0].title}</span>
      </span>
      <span className="shrink-0 t-section text-text-3" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
