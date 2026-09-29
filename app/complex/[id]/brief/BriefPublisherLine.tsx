"use client";

/* [1025 · 브리핑] 문서 발행자 줄 — "○○공인중개사 · 담당자 · 연락처 | 발행 YYYY-MM-DD".
   서버 HTML 은 "사무소 정보 입력 · 발행 —"(공용)이고, 붙은 뒤 이 기기의 localStorage 값과 오늘 날짜로 바뀐다.
   폼(BriefPublisherForm)이 저장할 때 쏘는 이벤트를 듣는다(lib/brief/publisher-store).
   [1025b · 브리핑] 문서 맨 위 **얇은 띠** — 카드 안쪽 여백을 되물려 가장자리까지 채운 한 줄(.brief-band · 인쇄는 선 하나).
   [1025c · 브리핑] 띠는 bg-primary-soft · 글자 primary(문서답게 — 시안 mock1025c/brief-d .band). 오른쪽은
   "발행 2026-09-29 · 내집나우 실거래 기준"(꼬리는 md 이상). */
import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { BAND_SOURCE_TAIL, EMPTY_PUBLISHER, PUBLISHER_PLACEHOLDER, issuedLabel, localIsoDate, publisherLine, type Publisher } from "@/lib/brief/model";
import { readPublisher, subscribePublisher } from "@/lib/brief/publisher-store";

export function BriefPublisherLine() {
  const [p, setP] = useState<Publisher>(EMPTY_PUBLISHER);
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    setP(readPublisher());
    setDate(localIsoDate());
    return subscribePublisher(setP);
  }, []);

  const line = publisherLine(p);
  return (
    <div className="brief-band -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 rounded-t-2xl bg-primary-soft px-4 py-2 t-caption font-bold text-primary md:-mx-9 md:-mt-8 md:px-9">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Icon name="briefcase" size={16} className="shrink-0" />
        <span className={`truncate ${line ? "" : "font-normal"}`}>{line ?? PUBLISHER_PLACEHOLDER}</span>
      </span>
      <span className="whitespace-nowrap tabular-nums">
        {issuedLabel(date)}
        <span className="max-md:hidden"> · {BAND_SOURCE_TAIL}</span>
      </span>
    </div>
  );
}

export default BriefPublisherLine;
