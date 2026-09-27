"use client";

import { Icon } from "@/app/components/Icon";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";

/**
 * /welcome → 노트 저장 → /map?from=welcome 핸드오프 배너.
 * 쿼리만 받고 실제 지도 포커스는 page/map-client 가 처리한다.
 */
export function WelcomeHandoff() {
  const sp = useSearchParams();
  const { promptUpgrade } = useUpgradePaywall();
  const [show, setShow] = useState(false);
  const fromWelcome = sp.get("from") === "welcome";
  const noteId = sp.get("noteId");
  const quota = sp.get("quota") === "1";
  const ai = sp.get("ai");

  useEffect(() => {
    if (!fromWelcome) return;
    setShow(true);
    try {
      window.localStorage.setItem("nz_journey_loop", "map");
      window.localStorage.removeItem("nz_onboarding_loop");
    } catch {
      /* ignore */
    }
    if (quota) {
      promptUpgrade({
        title: "AI 월간 한도 도달",
        message:
          "노트는 저장됐고 지도 비교로 이어졌어요. AI LLM 정리는 구독에서 이어서 쓸 수 있어요.",
        ctaLabel: "구독하고 AI 이어서 쓰기",
      });
    }
  }, [fromWelcome, quota, promptUpgrade]);

  if (!show || !fromWelcome) return null;

  const aiLabel =
    ai === "ok" ? "AI 정리 완료" : ai === "rule" ? "규칙 기반 요약" : "노트 저장됨";

  return (
    <div
      /* [v4] 자리 — 예전 top 12px 은 지도 머리(16~74, z-40) 밑이라 제목 줄이 머리에 가려졌다. 모바일은 칩 줄 아래(186),
         md 이상은 좌측 인기 단지 판 오른쪽 · 머리/칩 줄 아래(136)에 둔다(필터 판이 열리면 그 판이 위에 온다). */
      className="pointer-events-auto absolute left-4 right-4 top-[calc(env(safe-area-inset-top,0px)+186px)] z-30 md:left-[356px] md:right-auto md:top-[calc(env(safe-area-inset-top,0px)+136px)] md:w-[320px]"
      role="status"
    >
      {/* [1012 · 규칙 2·6·8] "온보딩 루프 완료"(내부 말) → 사실 · 800 → 700.
          [v4] 카드 + 큰 그림자 → 흰 면 + 1px 선 · 설명 문장("…나란히 비교할 수 있어요") → 사실 한 줄 · 옅은 파랑 칩 → 흰 칩 */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="t-body font-bold text-ink">{aiLabel}</div>
            <p className="mt-0.5 truncate t-sub text-text-3">
              {noteId ? "방금 쓴 노트 자리로 지도 이동" : "같은 생활권 단지 비교"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="-my-2 -mr-2.5 flex h-10 w-10 shrink-0 items-center justify-center text-text-3"
            aria-label="닫기"
          >
            {/* [1012 · 규칙 4] ✕ 활자 → 선 아이콘 x */}
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {noteId && (
            <Link
              href={`/notes/${encodeURIComponent(noteId)}`}
              className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline"
            >
              방금 쓴 노트 보기
            </Link>
          )}
          <Link
            href="/notes/new"
            className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline"
          >
            노트 더 쓰기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default WelcomeHandoff;
