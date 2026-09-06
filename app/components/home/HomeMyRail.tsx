"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";
import { useShellActive, type Shell } from "@/lib/client/viewport-shell";
import { HomeWatchlistBrief } from "@/app/components/HomeWatchlistBrief";
import { RecentComplexChips } from "@/app/components/RecentComplexes";

/* [967 · 27] 홈 "내 관심" 레일 — 로그인 사용자에게만, 관심단지 변동(HomeWatchlistBrief)
 * 과 최근 본 단지(RecentComplexChips)를 히어로 바로 아래 한 묶음으로.
 *
 * 왜 클라이언트 섬인가: 홈(app/page.tsx)은 revalidate=300 공유 캐시라 서버는 보는
 * 사람이 누군지 모른다(비로그인 HTML 을 모두에게 같이 내보내는 것이 이 페이지의
 * 성능 전제다 — 스케일 지침 #21). 그래서 서버 HTML 에는 이 레일이 **없고**, 마운트 뒤
 * 세션(getSessionLite — 헤더·다른 섬과 같은 모듈 캐시라 요청이 늘지 않는다)을 확인한
 * 사용자에게만 자식을 붙인다. 비로그인은 렌더 자체가 없으니 히어로가 밀리지 않는다
 * (LCP·CLS 그대로).
 *
 * 왜 자식이 둘 다 비면 레일째 숨기나: "내 관심" 제목만 있고 안이 빈 상자는 "당신은
 * 아직 아무것도 안 했다"는 빈 훈계처럼 읽힌다. 자식은 각자 빈 상태면 null 을 돌려주고
 * onResolved 로 그 사실을 알린다 — 둘 다 false 면 제목까지 지운다.
 *
 * 레이아웃: 자식이 확정되기 전에는 `contents`(상자를 만들지 않음)라 부모 flex 의 gap
 * 도 생기지 않는다. 채워질 때 한 번 아래가 밀리는 것은 로그인 사용자에게만 일어나고,
 * 위치를 미리 잡아 두면(고정 높이) 비었을 때 빈 칸이 남으므로 그쪽을 택하지 않았다. */
export function HomeMyRail({
  className = "",
  shell,
}: {
  className?: string;
  /** [968 · 8] 어느 벌인지 — 안 보이는 벌은 세션 조회도, 자식 마운트도 하지 않는다 */
  shell?: Shell;
}) {
  const active = useShellActive(shell);
  const [authed, setAuthed] = useState(false);
  const [briefHas, setBriefHas] = useState<boolean | null>(null);
  const [recentHas, setRecentHas] = useState<boolean | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void getSessionLite()
      .then((s) => {
        if (alive && s?.user?.email) setAuthed(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active]);

  if (!authed) return null;

  const any = Boolean(briefHas) || Boolean(recentHas);
  /* 자식은 늘 같은 자리에 마운트해 둔다(요소 종류·위치를 바꾸면 리마운트되어 조회가
     두 번 나간다). 둘 다 비었거나 아직 모르면 껍데기는 `contents` 로 상자를 만들지
     않고, 하나라도 채워지면 그때 제목과 테두리를 입힌다. */
  return (
    <section
      aria-label="내 관심"
      className={any ? `rise-in flex flex-col gap-2.5 ${className}` : "contents"}
    >
      {any && (
        <div className="flex items-baseline justify-between px-1">
          <h2 className="t-section text-ink">내 관심</h2>
          <Link href="/my/watchlist" className="t-sub font-semibold text-primary no-underline">
            관심 단지 관리 ›
          </Link>
        </div>
      )}
      <HomeWatchlistBrief onResolved={setBriefHas} />
      <RecentComplexChips
        onResolved={setRecentHas}
        className="rounded-2xl border border-line bg-surface p-4"
      />
    </section>
  );
}
