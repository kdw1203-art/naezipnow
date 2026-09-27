"use client";

import { useEffect, useState } from "react";
import { getHomePersonal } from "@/lib/client/home-personal";
import type { HomeRegionCard } from "@/lib/newui/home-data";
import { RegionRow } from "./HomeRows";

/* ============================================================
   [v4 · 규칙 2·4] 로그인 사용자의 관심지역 한 행 — 옛 "오늘의 한 줄"(HomeTodayLine)의 개인화 몫.

   예전: 네이비 회전 배너(워터마크 · 슬라이드 6장 · 점 6개 · "대표 지역"/"내 관심지역" 배지 · 9초 자동 넘김)가
   대표 지역 문장을 그리다가, 로그인 사용자는 붙은 뒤 자기 관심지역 문장으로 바뀌었다.
   지금: 대표 지역들은 "지역 동향" 목록의 서버 행이 이미 보여 준다. 이 조각은 **관심지역이 그 목록에 없을 때만**
   목록 맨 위에 같은 모양의 행 하나를 더한다(같은 지역을 두 번 그리지 않는다). 비로그인·관심지역 없음이면 아무것도
   그리지 않는다 — 서버 HTML(공유 ISR 캐시)에는 개인 정보가 없다. "관심지역 설정" 링크는 섹션 끝 캡션(서버)에 있다.
   나머지 슬라이드의 사실은 제자리로 옮겼다(시장 온도·기준금리 → 입구 목록, 거래 건수 → 지역 행, 노트 수 → 노트 섹션).
   ============================================================ */

type Personal = {
  primaryRegion: string | null;
  regionMarket: HomeRegionCard | null;
};

export function HomeMyRegionRow({ shownIds }: { shownIds: string[] }) {
  const [mine, setMine] = useState<HomeRegionCard | null>(null);
  const key = shownIds.join(",");

  useEffect(() => {
    let dead = false;
    getHomePersonal<Personal>()
      .then((j) => {
        if (dead || !j?.primaryRegion || !j.regionMarket?.price) return;
        if (key.split(",").includes(j.regionMarket.id)) return; // 이미 목록에 있는 지역
        setMine(j.regionMarket);
      })
      .catch(() => {
        /* 개인화 실패는 홈을 죽일 이유가 아니다 — 대표 지역 목록 그대로 둔다. */
      });
    return () => {
      dead = true;
    };
  }, [key]);

  if (!mine) return null;
  return <RegionRow card={mine} mine />;
}
