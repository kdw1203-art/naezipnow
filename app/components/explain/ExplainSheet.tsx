"use client";

import Link from "next/link";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { findGlossaryTerm } from "@/lib/seo/glossary-terms";
import { SITE_NOTES } from "@/lib/explain/site-notes";
import type { ExplainContent } from "./Explain";

/* [1009] 설명 바텀시트 본체 — Explain 버튼을 처음 누를 때만 내려받는 청크(용어사전 포함).
   모바일은 바닥에 붙는 시트(끌어서 닫기), 데스크톱은 가운데 대화상자 — 공용 Modal 그대로. */

const arr = (v: string | readonly string[] | undefined): string[] =>
  v === undefined ? [] : typeof v === "string" ? [v] : [...v];

export default function ExplainSheet({
  open,
  onClose,
  name,
  term,
  note,
  title,
  body,
  how,
  source,
}: ExplainContent & { open: boolean; onClose: () => void; name: string }) {
  const g = term ? findGlossaryTerm(term) : null;
  const n = note ? SITE_NOTES[note] : null;
  const heading = title ?? g?.term ?? n?.title ?? name;
  const own = arr(body);
  const defs = g ? [g.def, ...(g.extra ? [g.extra] : [])] : [];
  const noteBody = n ? [...n.body] : [];
  const howList = arr(how);
  return (
    <Modal open={open} onClose={onClose} label={`${heading} 설명`} maxWidth={440}>
      <ModalHeader title={heading} onClose={onClose} />
      <div className="flex flex-col gap-3">
        {g?.short && <p className="t-section text-ink break-words">{g.short}</p>}
        {(own.length > 0 || defs.length > 0 || noteBody.length > 0) && (
          <div className="flex flex-col gap-2 t-body text-text-1 break-words">
            {own.map((p, i) => (
              <p key={`o${i}`}>{p}</p>
            ))}
            {defs.map((p, i) => (
              <p key={`d${i}`}>{p}</p>
            ))}
            {noteBody.map((p, i) => (
              <p key={`n${i}`}>{p}</p>
            ))}
          </div>
        )}
        {howList.length > 0 && (
          <div className="rounded-xl bg-bg px-3.5 py-3">
            <div className="t-sub font-bold text-text-2">이 화면은 이렇게 계산했어요</div>
            <ul className="mt-1.5 flex flex-col gap-1 t-sub text-text-1 break-words">
              {howList.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <span aria-hidden="true" className="text-text-3">
                    ·
                  </span>
                  <span className="min-w-0">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {source && <p className="t-caption text-text-3 break-words">출처 · {source}</p>}
        {g && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href={`/glossary/${g.slug}`}
              onClick={onClose}
              className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary"
            >
              용어사전에서 자세히 보기 ›
            </Link>
            {g.href && (
              <Link
                href={g.href}
                onClick={onClose}
                className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary"
              >
                {g.hrefLabel ?? "관련 화면 보기"} ›
              </Link>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
