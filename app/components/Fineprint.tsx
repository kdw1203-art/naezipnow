/* [1036 · 밀도] 기준·출처 접기 — 카드마다 두세 줄씩 깔리던 설명문(출처 · 집계 기준 · 범례)을 한 줄 토글 뒤로 보낸다.
 *
 * 왜: 소유자 지시 "글씨가 너무 많고 복잡해 보인다"(10-05). 숫자 하나에 설명 세 줄이 붙으면 화면이 글로 덮인다.
 * 규칙(docs/design-system.md): 설명은 ⓘ — 이 요소는 ⓘ 의 문단판이다. 글은 지우지 않고(JSON-LD·검사·사실 표기 유지)
 * 접어 둔다. JS 없음(native details) — 번들 0 · 서버 컴포넌트에서도 쓴다.
 *
 * 쓰임: <Fineprint>국토교통부 실거래가 · 신고가 = …</Fineprint> — 라벨 기본 "기준 · 출처".
 * 폰: summary 가 40px 탭 면(.fineprint > summary 규칙, globals.css) · 데스크톱 24px. */
import type { ReactNode } from "react";

export function Fineprint({
  label = "기준 · 출처",
  children,
  className = "",
  open,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
  /** 처음부터 펼쳐 둘 때(드묾 — 검사·심사용 표면) */
  open?: boolean;
}) {
  return (
    <details className={`fineprint ${className}`} open={open}>
      <summary className="t-caption text-text-3">{label}</summary>
      <div className="fineprint-body t-caption text-text-3">{children}</div>
    </details>
  );
}
