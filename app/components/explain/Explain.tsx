"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "@/app/components/Icon";
import { explainTermName, type ExplainTerm } from "@/lib/explain/term-index";
import { SITE_NOTES, type SiteNoteKey } from "@/lib/explain/site-notes";

/* [1009] 숫자·용어 옆 ⓘ — 누르면 "이게 뭔가요?" 바텀시트(토스 관례).
 *
 * 왜(2026-09-22 실측): 설명이 필요한 자리 대부분이 `title=` 말풍선(마우스를 올려야만 보임)이거나
 * 아예 없었다. 휴대폰에는 마우스가 없으니 모바일 방문자에게는 설명이 **존재하지 않았다**
 * (홈 임장 점수 "현장 체크 5개 항목 평균 × 20", 노트 위치 확인 배지 등).
 *
 * 무게: 이 파일은 버튼뿐이다. 시트(Modal)와 용어사전 본문(56개 · 약 40KB)은 **처음 누를 때**
 * 따로 불러온다(next/dynamic — 라우트 예산에 잡히지 않는 청크). 손가락이 닿거나 마우스가
 * 올라오는 순간 미리 받아 두어 누른 뒤 기다림이 거의 없다.
 *
 * 쓰는 법(셋 중 하나 이상):
 *   <Explain term="jeonse-garyul" />                         용어사전 정의 그대로
 *   <Explain note="delta" />                                  사이트 공통 읽는 법(등락 표시)
 *   <Explain title="임장 점수" body="…" how="…" source="…" />  이 화면만의 숫자 설명(코드와 같은 말로)
 * term 과 how/source 를 같이 주면 "정의 + 이 화면의 계산"이 한 시트에 나온다.
 * <a>·<Link>·<label> 안에 넣지 말 것 — 중첩 인터랙티브이고, <label> 안이면 라벨 글자를 눌러도 이 버튼이 눌린다
 * (1009 리뷰 RB 실측: 전월세 전환율 입력칸). 라벨 **옆 형제**로 둔다.
 */

export type ExplainContent = {
  /** 용어사전 슬러그 — lib/seo/glossary-terms.ts */
  term?: ExplainTerm;
  /** 사이트 공통 읽는 법 — lib/explain/site-notes.ts */
  note?: SiteNoteKey;
  /** 시트 제목(없으면 용어 이름) */
  title?: string;
  /** 이 화면만의 설명 문단 — 정의보다 먼저 나온다 */
  body?: string | readonly string[];
  /** "이 화면은 이렇게 계산했어요" 상자 — 실제 코드의 계산과 같은 말로만 */
  how?: string | readonly string[];
  /** 출처 · 기준일 — "국토교통부 실거래가 · 2026.09 기준" */
  source?: string;
};

const loadSheet = () => import("./ExplainSheet");
const ExplainSheet = dynamic(loadSheet, { ssr: false, loading: () => null });

export function Explain({
  label,
  className,
  size = 14,
  ...content
}: ExplainContent & {
  /** 버튼 이름(스크린리더) — 없으면 제목·용어 이름에서 만든다 */
  label?: string;
  className?: string;
  /** 아이콘 크기(px) — 버튼 히트 영역은 24px 이상으로 고정 */
  size?: 12 | 14 | 16;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const name =
    label ??
    content.title ??
    (content.term ? explainTermName(content.term) : null) ??
    (content.note ? SITE_NOTES[content.note].title : null) ??
    "용어";
  const warm = () => {
    void loadSheet();
  };
  return (
    <>
      <button
        type="button"
        className={`explain-btn ${className ?? ""}`}
        aria-label={`${name} 설명 보기`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={warm}
        onPointerDown={warm}
        onFocus={warm}
        onClick={(e) => {
          /* 카드 전체가 링크인 자리(목록 행) 안에 놓여도 설명만 열리게 */
          e.preventDefault();
          e.stopPropagation();
          setArmed(true);
          setOpen(true);
        }}
      >
        <Icon name="info" size={size} strokeWidth={2} />
      </button>
      {armed && (
        /* [1009 · 리뷰 RA] 시트는 포털(document.body)이지만 React 이벤트는 **React 트리**를 따라 올라간다 —
           조상에 <Link>·onClick 이 있으면 시트 안 닫기 버튼만 눌러도 그 링크가 눌린 것으로 처리될 수 있다.
           여기서 클릭 전파를 끊는다(DOM 에는 빈 span 하나). */
        <span role="presentation" onClick={(e) => e.stopPropagation()}>
          <ExplainSheet open={open} onClose={() => setOpen(false)} name={name} {...content} />
        </span>
      )}
    </>
  );
}

export default Explain;
