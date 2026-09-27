"use client";
/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { listCompareTray } from "@/lib/newui/compare-tray";
import { useHubPicked } from "./hub-context";
import { RowChevron } from "./hub-row";

/* 분석 허브 항목별 고유 기능(#411) — 클라이언트 조각 3종.
 *
 * 1) ToolLink: 행 클릭 시 "마지막 사용 도구"를 localStorage 에 기록.
 * 2) LastToolChip: 다음 방문 때 검색창 아래 "최근 · 도구 이름 ›" 글자 링크 (기록 없으면 없음).
 * 3) CompareTrayValue: 후보 단지 비교 행 오른쪽 값 — 지금 담겨 있는 후보 수(실카운트).
 *    0개면 숫자 대신 `›`(빈 트레이에 "0곳"은 소음이다).
 * [v4] 칩·배지 모양을 걷고 목록 행의 글자(보조 링크·오른쪽 값)로 바꿨다.
 */

const LAST_TOOL_KEY = "nz_last_analysis_tool";

interface LastTool {
  href: string;
  title: string;
  at: number;
}

function readLastTool(): LastTool | null {
  try {
    const raw = window.localStorage.getItem(LAST_TOOL_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LastTool>;
    if (typeof o.href !== "string" || typeof o.title !== "string") return null;
    return { href: o.href, title: o.title, at: Number(o.at) || 0 };
  } catch {
    return null;
  }
}

export function ToolLink({
  href,
  title,
  className,
  style,
  children,
  withPicked = false,
}: {
  href: string;
  title: string;
  className?: string;
  /** [980] 도구 성격 색을 CSS 변수로 꽂는 자리 — 안쪽 클래스는 변수만 읽는다 */
  style?: CSSProperties;
  children: ReactNode;
  /** 히어로에서 고른 단지를 ?complexId= 로 실어 보낼 도구인지 (tool-catalog.ACCEPTS_COMPLEX) */
  withPicked?: boolean;
}) {
  /* 허브가 공유하는 선택 단지 — 서버가 그린 카드 내용은 그대로 두고 **링크만**
     바꾼다. 그래서 스파크라인·티저는 서버 렌더 그대로면서도, 위에서 단지를
     고르면 이 카드가 그 단지로 열린다. */
  const { query } = useHubPicked();
  const target = withPicked && query ? `${href}${query}` : href;
  return (
    <Link
      href={target}
      className={className}
      style={style}
      onClick={() => {
        try {
          window.localStorage.setItem(
            LAST_TOOL_KEY,
            JSON.stringify({ href, title, at: Date.now() } satisfies LastTool),
          );
        } catch {
          /* 저장 실패는 기능 자체(이동)에 영향 없음 */
        }
      }}
    >
      {children}
    </Link>
  );
}

export function LastToolChip() {
  const [last, setLast] = useState<LastTool | null>(null);
  useEffect(() => {
    setLast(readLastTool());
  }, []);
  if (!last) return null;
  return (
    <Link href={last.href} className="tap-line t-sub text-text-2 no-underline">
      최근 · {last.title} ›
    </Link>
  );
}

/** 후보 단지 비교 행 오른쪽 — 담은 후보 수(실카운트) 또는 `›` */
export function CompareTrayValue() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    try {
      setCount(listCompareTray().length);
    } catch {
      setCount(0);
    }
  }, []);
  if (count <= 0) return <RowChevron />;
  return <span className="shrink-0 t-section t-num text-ink">{count}곳</span>;
}
