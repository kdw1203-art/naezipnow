"use client";

import { useEffect, useState } from "react";

/**
 * [968 · 19] 저속망·데이터 절약 힌트 — Link 프리페치를 끌지 판단하는 한 곳.
 *
 * 왜: 홈 하나에 `<Link>` 가 30개를 넘고 Next 는 뷰포트에 들어온 링크를 전부
 * 프리페치한다. 와이파이에선 이득이지만, 데이터 절약 모드를 켠 사람이나 2g·3g
 * 에서는 보지도 않을 화면의 RSC 페이로드가 먼저 내려와 실제로 누른 화면의
 * 응답을 밀어낸다. 브라우저가 알려 주는 두 신호(`saveData`, `effectiveType`)
 * 를 읽어 "프리페치를 아끼자"는 하나의 불리언으로 접는다.
 *
 * - Network Information API 가 없는 브라우저(사파리 전부)는 false — 모른다고
 *   느리다고 단정하지 않는다(프리페치가 기본이다).
 * - 순수 판정(`isReducedDataConnection`)과 브라우저 읽기(`prefersReducedData`)
 *   를 나눠 둔 것은 전자를 단위 테스트하기 위해서다.
 */

export type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
} | null | undefined;

/** 프리페치를 아낄 유효 회선 유형 — 4g 만 "충분히 빠르다"로 본다. */
export const SLOW_EFFECTIVE_TYPES: ReadonlySet<string> = new Set(["slow-2g", "2g", "3g"]);

/** 순수 판정: 데이터 절약 모드이거나 유효 회선이 3g 이하면 true. API 부재는 false. */
export function isReducedDataConnection(conn: ConnectionLike): boolean {
  if (!conn) return false;
  if (conn.saveData === true) return true;
  const et = typeof conn.effectiveType === "string" ? conn.effectiveType.toLowerCase() : "";
  return et !== "" && SLOW_EFFECTIVE_TYPES.has(et);
}

type NavigatorWithConnection = Navigator & {
  connection?: ConnectionLike;
  mozConnection?: ConnectionLike;
  webkitConnection?: ConnectionLike;
};

/** 브라우저에서 읽는다 — 서버·API 부재면 false. */
export function prefersReducedData(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as NavigatorWithConnection;
  const conn = n.connection ?? n.mozConnection ?? n.webkitConnection ?? null;
  return isReducedDataConnection(conn);
}

/**
 * 마운트 뒤 한 번 계산한 값 — 서버 HTML 과 첫 클라이언트 렌더는 false 로 같게
 * 두어 하이드레이션 불일치를 만들지 않는다(`prefetch` 프롭만 갈리는 것은 Next 가
 * 허용하지만, 마크업까지 갈리는 쓰임이 생겨도 안전하도록 상태로 든다).
 */
export function useReducedData(): boolean {
  const [lite, setLite] = useState(false);
  useEffect(() => {
    setLite(prefersReducedData());
  }, []);
  return lite;
}
