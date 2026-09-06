"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { WatchlistButton } from "./hub-client";

/* [967 · 17] 모바일 하단 액션 바 — 관심 등록 · 노트 쓰기 · 전문가 상담.
   긴 단지 페이지의 중간에서도 다음 행동이 손에 닿게 한다. 세 행동 모두 페이지에
   이미 있는 것과 같은 컴포넌트·주소다(동작이 두 갈래가 아니다).

   보이는 조건 셋 — 모두 마운트 뒤에 판정하므로 ISR HTML(방문자 공용)에는 바가 없다:
   ① 원래 CTA 블록(상단 알약 줄·하단 CTA)이 화면 밖일 때만(같은 행동이 두 번
      보이지 않게, IntersectionObserver).
   ② 전체 화면 모달이 열려 있지 않을 때(ui/Modal 이 body 에 data-modal-open 을
      남긴다 — InstallPrompt·IosInstallHint 와 같은 판정).
   ③ md 미만(클래스 md:hidden). 데스크탑은 우측 사이드바 CTA 가 늘 보인다. */

export function MobileActionBar({
  complexId,
  complexName,
  noteHref,
  consultHref,
  sentinelIds,
}: {
  complexId: string;
  complexName: string;
  noteHref: string;
  consultHref: string;
  /** 이 id 의 요소 중 하나라도 화면에 있으면 바를 숨긴다 */
  sentinelIds: readonly string[];
}) {
  /* 처음엔 "가려져 있다"로 시작 — 관찰 결과가 오기 전 한 프레임 상단 알약 줄과
     겹쳐 뜨는 걸 막는다(첫 화면은 보통 상단 CTA 가 보이는 상태다). */
  const [ctaInView, setCtaInView] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  /* 배열 참조가 아니라 내용으로 의존 — 부모가 다시 그려도 관찰자를 새로 만들지 않는다 */
  const sentinelKey = sentinelIds.join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = sentinelKey
      .split("|")
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) {
      setCtaInView(false);
      return;
    }
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setCtaInView(visible.size > 0);
      },
      { threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sentinelKey]);

  useEffect(() => {
    const read = () => setModalOpen(document.body.dataset.modalOpen != null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-modal-open"] });
    return () => observer.disconnect();
  }, []);

  /* 본문이 바에 가리지 않게 body 아래 여백(globals.css `.nz-has-actionbar`).
     보일 때만 넣었다 뺐다 하면 스크롤 중 레이아웃이 튀므로 마운트 동안 고정한다. */
  useEffect(() => {
    document.body.classList.add("nz-has-actionbar");
    return () => document.body.classList.remove("nz-has-actionbar");
  }, []);

  if (ctaInView || modalOpen) return null;

  const item =
    "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 t-caption font-bold text-text-1 no-underline";

  return (
    <div
      data-noprint
      role="region"
      aria-label="단지 빠른 행동"
      className="complex-actionbar fixed inset-x-0 z-30 flex justify-center px-3 md:hidden"
    >
      <div className="glass grid w-full max-w-[560px] grid-cols-3 gap-1 rounded-2xl p-1.5 shadow-[0_12px_32px_rgba(16,28,54,.16)]">
        <WatchlistButton complexId={complexId} complexName={complexName} variant="bar" />
        <Link href={noteHref} className={item}>
          <Icon name="notebook-pen" size={18} />
          노트 쓰기
        </Link>
        <Link href={consultHref} className={item}>
          <Icon name="handshake" size={18} />
          전문가 상담
        </Link>
      </div>
    </div>
  );
}
