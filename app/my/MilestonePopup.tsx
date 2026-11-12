"use client";
/* [1168] 함께한 기록 팝업 — 가입 뒤 일주일 · 한 달 · 6개월 · 1년이 된 주에 MY 에서 한 번. */
import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";

export function MilestonePopup({
  markId,
  title,
  cells,
  href,
  cta,
}: {
  markId: string;
  title: string;
  cells: { label: string; value: string }[];
  href: string;
  cta: string;
}) {
  const [open, setOpen] = useState(false);
  const key = `nz-milestone-${markId}`;
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) !== "1") setOpen(true);
    } catch {
      /* 저장소를 못 쓰는 브라우저에서는 띄우지 않는다(매번 뜨는 것보다 낫다) */
    }
  }, [key]);
  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* 무시 */
    }
  };
  return (
    <Modal open={open} onClose={close} label={title}>
      <ModalHeader title={title} onClose={close} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="rounded-xl bg-bg px-1 py-3 text-center">
              <div className="t-section font-bold tabular-nums text-ink">{c.value}</div>
              <div className="t-caption text-text-3">{c.label}</div>
            </div>
          ))}
        </div>
        <Link href={href} onClick={close} className="btn-primary rounded-xl p-3 text-center t-body no-underline">
          {cta}
        </Link>
      </div>
    </Modal>
  );
}
