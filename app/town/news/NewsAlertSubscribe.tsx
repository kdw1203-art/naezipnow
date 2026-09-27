"use client";

import { useState } from "react";
import { KeywordAlertButton } from "@/app/components/KeywordAlertButton";

/* [개선 #13] 뉴스 키워드 알림 구독 스트립.
 * 관심 동네·단지·키워드를 입력하면 저장 검색(scope:"news")으로 구독된다 —
 * 자동수집 뉴스·동네글에 그 키워드가 새로 등장하면 알림함으로 알려 준다.
 * KeywordAlertButton 을 key={q} 로 다시 마운트해 키워드 변경 시 상태를 초기화한다.
 * [v4 · 규칙 5·7] 목록 위 카드(종 아이콘 + 라벨) → 목록 끝 섹션: t-section 제목 + 입력 + 추천 칩(누르면 입력이 바뀌는 선택)
 * — 카드 테두리·장식 아이콘 없음. 알림 버튼(KeywordAlertButton)의 종 아이콘은 조작 버튼이라 그대로다. */

const SUGGESTIONS = ["재건축", "분양", "GTX", "전세"];

export function NewsAlertSubscribe() {
  const [q, setQ] = useState("");
  const trimmed = q.trim();

  return (
    <section aria-labelledby="news-alert-title" className="mt-8 flex flex-wrap items-center gap-2.5">
      <h2 id="news-alert-title" className="basis-full t-section text-ink">
        키워드 알림
      </h2>
      {/* [970 · C-08] 모바일(390px)에서 라벨·입력·추천 칩 4개가 한 줄에 flex-1 로 끼어
          입력칸이 30px 폭으로 찌그러졌다. 좁은 화면에선 입력과 칩 줄이 각각 제 줄을
          갖고(basis-full), sm 부터 종전대로 한 줄. */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="알림 받을 키워드"
        placeholder="동네·단지·키워드 (예: 성동구, 재건축)"
        maxLength={40}
        className="min-h-10 min-w-[160px] basis-full rounded-lg border border-line bg-surface px-3.5 py-1.5 t-body text-ink placeholder:text-text-3 sm:flex-1 sm:basis-auto"
      />
      {trimmed ? (
        <KeywordAlertButton key={trimmed} scope="news" query={trimmed} />
      ) : (
        <div className="flex basis-full flex-wrap items-center gap-1.5 sm:basis-auto">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className="chip min-h-10 border border-line bg-surface px-3 py-1 t-sub font-bold text-text-2"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
