import Link from "next/link";
import { PageHead } from "@/app/components/PageHead";

/* [1044] 뉴스룸 머리 — 뉴스가 동네에서 떨어져 나온 뒤의 제 머리.
 *
 * 소유자 지시(2026-10-06): "뉴스랑 동네글을 분리해줘"(메뉴까지). 1043 까지 뉴스룸은 동네 카테고리 목록의 한 칸이라
 * 머리를 TownHero(lib/town/category-links)에서 받았고, 그 아래에 동네 카테고리 줄이 섰다. 이제 뉴스는 제 대분류
 * (app/components/nav-data.ts "뉴스")라 카테고리 목록에 없다 — 머리 문구를 여기 한 곳에 둔다.
 *
 * 모양은 그대로다: 청약 센터·공매·입주·정비사업·임장노트와 같은 공용 PageHead(아이콘 칩 40 · 제목 · 사실 한 줄 |
 * 버튼 하나). 1043 의 "디자인 통일"은 부품이 같다는 뜻이지 같은 줄에 서 있다는 뜻이 아니다.
 * 로딩 스켈레톤(loading.tsx)도 이 부품을 그대로 그려 로딩 중과 로딩 후가 같은 머리다. */
export const NEWS_HEAD = {
  icon: "newspaper",
  tone: "bg-warning-soft text-warning",
  title: "뉴스룸",
  sub: "매일 아침 모은 부동산 기사 요약과 주간 다이제스트",
} as const;

export function NewsHead() {
  return (
    <PageHead
      icon={NEWS_HEAD.icon}
      tone={NEWS_HEAD.tone}
      title={NEWS_HEAD.title}
      sub={NEWS_HEAD.sub}
      className="mb-4"
      actions={
        <Link href="/digest" className="btn-outline btn-md rounded-xl no-underline">
          주간 다이제스트
        </Link>
      }
    />
  );
}
