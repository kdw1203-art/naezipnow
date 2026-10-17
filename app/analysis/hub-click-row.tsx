"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useHubPicked } from "./hub-context";
import { rememberTool } from "./tool-cards-client";

/* [1071] 표의 한 줄 전체를 누를 수 있게 — 단지 분석 표(hub-tiers)와 같은 손맛.
 *
 * 줄 안의 링크·단추는 제 일을 하게 두고(closest("a,button")), 그 밖(하는 일 · 지금 값 칸)을 누르면
 * 그 도구로 간다. 단지를 이미 골랐으면 ?complexId= 를 붙인다(ToolLink 와 같은 규칙 — ACCEPTS_COMPLEX).
 * 칸 내용은 서버가 그린다(children) — 이 부품은 tr 하나와 클릭만 들고 있다. */
export function ClickRow({
  href,
  title,
  withPicked,
  className,
  children,
}: {
  href: string;
  title: string;
  withPicked: boolean;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { query } = useHubPicked();
  const target = withPicked && query ? `${href}${query}` : href;
  return (
    <tr
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        rememberTool(href, title);
        router.push(target);
      }}
    >
      {children}
    </tr>
  );
}
