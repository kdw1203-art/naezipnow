"use client";

/* [1025 · 브리핑] 사무소 정보 폼 + "PDF 로 저장" + "링크 복사" — 오른쪽 레일(lg) · 폰은 문서 위.
   값은 이 기기(localStorage)에만 저장 — 게스트도 된다. 링크 복사는 정규 주소만(쿼리에 사무소 정보를 싣지 않는다).
   PDF 저장은 브라우저 인쇄(window.print) — pdf_export 게이트(요금제)를 쓰지 않는다. 인쇄 때 이 카드는 숨는다(data-noprint).
   채움 파랑은 이 화면에 이 버튼 하나.

   [1025b · 브리핑] 핵심 2칸(사무소명·연락처)만 앞에, 담당자는 <details> 안(닫힌 채 — 열면 같은 카드 안).
   버튼은 "PDF 로 저장"(채움 1) + "링크 복사"(텍스트 버튼). 요소(actions) 하나를 데스크톱 레일(lg+)은 카드 안에, 그 아래는
   폰 하단 고정 바(MobilePrimaryBar — 결정 카드·AI 비서와 같은 부품)가 든다 — 채움 파랑 리터럴은 이 파일에 하나.

   [1025c · 브리핑] 손잡이 — "표 강조 타입" 칩(표 행과 같은 타입, 최대 4). 고르면 문서의 미니 카드·표 행 중 그 타입이
   강조된다(lib/brief/highlight-store → BriefHighlightBridge). 저장하지 않는다(문서를 열면 거래 많은 첫 타입). */
import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { StepLine } from "@/app/components/StepLine";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { useCopy } from "@/lib/ui/use-copy";
import { EMPTY_PUBLISHER, PUBLISHER_MAX, type Publisher } from "@/lib/brief/model";
import { readPublisher, writePublisher } from "@/lib/brief/publisher-store";
import { readHighlight, writeHighlight } from "@/lib/brief/highlight-store";

export function BriefPublisherForm({ sharePath, types = [] }: { sharePath: string; types?: readonly number[] }) {
  const [p, setP] = useState<Publisher>(EMPTY_PUBLISHER);
  const { copy, copied } = useCopy("링크를 복사했어요");
  const [hl, setHl] = useState<number | null>(null);
  const picked = hl != null && types.includes(hl) ? hl : (types[0] ?? null);

  useEffect(() => {
    setP(readPublisher());
    setHl(readHighlight());
  }, []);

  const pick = (area: number) => {
    setHl(area);
    writeHighlight(area);
  };

  const set = (k: keyof Publisher) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...p, [k]: e.target.value };
    setP(next);
    writePublisher(next);
  };

  const [printed, setPrinted] = useState(false);
  const print = () => {
    if (typeof window === "undefined") return;
    setPrinted(true);
    window.print();
  };
  const copyLink = () => {
    if (typeof window === "undefined") return;
    /* 정규 주소만 — 현재 주소에 쿼리·해시가 있어도 버린다 */
    void copy(new URL(sharePath, window.location.origin).toString());
  };

  const field = (k: keyof Publisher, label: string, placeholder: string, type: "text" | "tel" = "text") => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="t-caption text-text-3">{label}</span>
      <input
        type={type}
        value={p[k]}
        onChange={set(k)}
        maxLength={PUBLISHER_MAX[k]}
        placeholder={placeholder}
        autoComplete={k === "phone" ? "tel" : k === "agent" ? "name" : "organization"}
        className="input min-h-10 w-full px-3 t-body text-ink"
      />
    </label>
  );

  /* 행동 — lg+ 는 카드 안 세로, 그 아래는 하단 바 안 가로(같은 요소) */
  const actions = (
    <div className="brief-actions flex flex-row gap-1 lg:mt-3 lg:flex-col">
      <button type="button" onClick={print} className="btn-primary btn-md press flex-1 gap-1.5 max-lg:min-h-12">
        <Icon name="file-text" size={16} />
        PDF 로 저장
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="press inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg t-sub font-bold text-primary max-lg:min-h-12"
      >
        <Icon name="link" size={16} />
        {copied ? "복사했어요" : "링크 복사"}
      </button>
    </div>
  );

  return (
    <>
      <section data-noprint="" aria-labelledby="brief-form-title" className="card rounded-2xl p-4 max-md:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="brief-form-title" className="t-section text-ink">
            사무소 정보
          </h2>
          <span className="t-caption text-text-3">이 기기에만 저장 · 링크에는 안 담김</span>
        </div>
        {/* [1025b] 절차 한 줄 — 단지(완료) → 사무소 정보 → 인쇄·링크 */}
        <StepLine
          className="mt-2"
          current={printed || copied ? 3 : p.office.trim() && p.phone.trim() ? 2 : 1}
          steps={[{ label: "단지" }, { label: "사무소 정보" }, { label: "PDF·링크" }]}
        />
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-1">
          {field("office", "사무소명", "○○공인중개사")}
          {field("phone", "연락처", "010-0000-0000", "tel")}
        </div>
        <details className="group mt-2">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 t-sub font-bold text-text-2 [&::-webkit-details-marker]:hidden">
            담당자
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="pb-1">{field("agent", "담당자", "이름")}</div>
        </details>
        {types.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="brief-hl-title" className="t-section text-ink">표 강조 타입</h3>
              <span className="t-caption text-text-3">손잡이 · 문서에 반영</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="brief-hl-title">
              {types.map((a) => {
                const on = a === picked;
                return (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(a)}
                    className={`chip press min-h-8 border px-2.5 t-sub font-bold tabular-nums ${on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2"}`}
                  >
                    {a}㎡
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="max-lg:hidden">{actions}</div>
      </section>
      <MobilePrimaryBar label="PDF 로 저장">{actions}</MobilePrimaryBar>
    </>
  );
}

export default BriefPublisherForm;
