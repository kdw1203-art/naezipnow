"use client";

import { useEffect, useState } from "react";
import {
  COMPARE_TRAY_MAX,
  isInCompareTray,
  listCompareTray,
  subscribeCompareTray,
  toggleCompareTray,
} from "@/lib/newui/compare-tray";
import { useToast } from "@/app/components/toast/ToastProvider";

/* 비교 담기 버튼 — lib/newui/compare-tray (localStorage, 최대 5개).
 *
 * 번들 분리(#412, 2026-08-16): 원래 단지 허브의 hub-client.tsx 안에 있었는데,
 * /map 이 이 버튼 하나를 쓰려고 hub-client 전체(가격 차트·AI 패널·허브 탭)를
 * 정적으로 끌고 왔다. 버튼만 독립 모듈로 빼서 /map 라우트 청크에서 허브
 * 코드를 떼어낸다. hub-client 는 하위 호환을 위해 재수출한다.
 *
 * [1009 · T] 결과 반응 — 담으면 토스트 "비교함에 담았어요 (2/5) · 비교하기", 빼면 "비교함에서 뺐어요 · 되돌리기"
 * (원래 자리로 다시 담는다 — 로그인이면 "비교함과 관심 단지에서 뺐어요", 아래 [리뷰] 참고), 가득 차면 버튼 글자가
 * 2초 바뀌던 것에 더해 토스트로 "비교함 보기"를 준다.
 * 체크 표시는 담을 때 한 번 튄다(njn-pop-once). /complex/[id] 예산(480KB)이 빠듯해 코드는 최소로.
 */
const COMPARE_HREF = "/analysis/compare";

/* [1009 · T 리뷰] 관심 단지(#46) 동기화·되돌리기는 누를 때만 받는 조각(app/my/compare-watch-sync) — 순서 보장·사실대로 토스트·
   원래 자리 되돌리기. /complex/[id] 첫 로드 예산이 빠듯해 이 파일에는 토글과 담기 토스트만 둔다. */
const loadSync = () => import("@/app/my/compare-watch-sync");

export function CompareTrayButton({
  complexId,
  name,
  region,
}: {
  complexId: string;
  name: string;
  region?: string;
}) {
  const { showToast } = useToast();
  const [inTray, setInTray] = useState(false);
  const [full, setFull] = useState(false);
  const [pop, setPop] = useState(0);

  useEffect(() => {
    setInTray(isInCompareTray(complexId));
    return subscribeCompareTray(() => setInTray(isInCompareTray(complexId)));
  }, [complexId]);

  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => setFull(false), 2000);
    return () => clearTimeout(t);
  }, [full]);

  const onClick = () => {
    const index = listCompareTray().findIndex((i) => i.id === complexId);
    const r = toggleCompareTray({ id: complexId, name, region });
    setInTray(r.inTray);
    setFull(r.full);
    if (r.inTray) {
      // #46 로그인 상태면 서버 관심 단지에도 담는다(앞선 빼기가 끝난 뒤 — 순서는 조각 안의 줄이 지킨다)
      void loadSync().then((m) => m.addWatch(complexId, name), () => undefined);
      setPop((n) => n + 1);
      showToast(`비교함에 담았어요 (${r.items.length}/${COMPARE_TRAY_MAX})`, { label: "비교하기", href: COMPARE_HREF });
    } else if (r.full) {
      showToast(`비교함은 ${COMPARE_TRAY_MAX}개까지 담겨요`, { label: "비교함 보기", href: COMPARE_HREF });
    } else {
      /* 빼기 — 토스트는 조각이 서버 결과를 본 뒤 사실대로("비교함과 관심 단지에서 뺐어요" 등) + 되돌리기(원래 자리) */
      void loadSync().then(
        (m) => m.removeWithWatch({ id: complexId, name, region, index }, showToast),
        () => showToast("비교함에서 뺐어요"), // 조각을 못 받으면(오프라인) 비교함 결과만 말한다
      );
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inTray}
      className={`press flex-1 rounded-[10px] p-3 text-center text-[13px] transition-colors ${
        /* [970 · B-06] 네이비 위 글자는 text-on-dark — text-surface 는 다크에서 어두운 면색이 돼 안 보였다 */
        inTray ? "bg-brand-navy font-extrabold text-on-dark" : "btn-secondary"
      }`}
    >
      {full ? (
        "최대 5개까지 담겨요"
      ) : inTray ? (
        <>
          비교 담김{" "}
          <span key={pop} aria-hidden="true" className={`inline-block ${pop ? "njn-pop-once" : ""}`}>
            ✓
          </span>
        </>
      ) : (
        "비교 담기"
      )}
    </button>
  );
}
