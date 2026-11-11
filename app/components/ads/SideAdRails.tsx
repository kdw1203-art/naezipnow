import { AdZone } from "./AdZone";
import { SideRailGate } from "./SideRailGate";

/**
 * [1124 · 좌우 광고 띠] 소유자 2026-11-10 "광고는 중앙배치보다는 좌우 양옆으로 빼줘 · 중앙에도 일부는 넣는데 작은 공간 남는 곳으로".
 *
 * 루트 레이아웃(app/layout.tsx)이 한 번 그린다 — PageShell 은 클라이언트 화면도 import 하므로 서버 조각을 둘 수 없다.
 * 본문 열(1240 · 넓은 화면 1400) 바깥 왼쪽 · 오른쪽 빈 여백에 세로 띠(160px) 하나씩 —
 * 여백이 실제로 남는 넓은 PC 화면에서만 보인다(globals.css `.side-ad-rail` · 1640px / 넓은 화면 1800px 부터).
 * 띠가 보이는 동안 본문 가운데 흐름 사이의 광고(AdZone data-spot="center")는 CSS 가 숨긴다 —
 * 가운데에는 옆 열 · 글 끝 · 페이지 끝 같은 작은 남는 자리만 남는다. 폰 · 좁은 화면은 여백이 없어 예전 그대로.
 * 고정(sticky) 아님 — 문서 위쪽에 놓이고 스크롤하면 같이 올라간다. 제외 경로 · 광고 없는 플랜에는 안 나간다.
 */
export function SideAdRails() {
  return (
    <SideRailGate>
      <div className="side-ad-rail" data-side="left">
        <AdZone placement="sidebar" seed={2} plan={null} spot="side" shape="vertical" />
      </div>
      <div className="side-ad-rail" data-side="right">
        <AdZone placement="sidebar" seed={3} plan={null} spot="side" shape="vertical" />
      </div>
    </SideRailGate>
  );
}

export default SideAdRails;
