"use client";

import { useState } from "react";
import { scrollBehavior } from "@/lib/ui/scroll";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";
import { JeonseSelfCheck, SELF_CHECK_ANCHOR_ID } from "./JeonseSelfCheck";

/* P0-5 목업 정직화: 특정 단지의 가짜 진단 "결과"를 통째로 보여주던 화면을
   입력 기반으로 전환. 자동 진단 엔진은 아직 없으므로 결과를 지어내지 않고,
   "안전 진단" 버튼은 실제로 동작하는 자가진단(JeonseSelfCheck)으로
   스크롤·프리필 연결한다 + 직접 확인용 체크리스트 안내를 제공한다. */

/* 매매/전세/월세 세그먼트 탭을 제거했다.
   탭의 mode 값은 제목 한 줄에 끼워 넣는 것 말고는 아무 데도 쓰이지 않았고,
   체크리스트(깡통전세·선순위 근저당·HUG 보증)도 AI 패널도 아래 자가진단
   (JeonseSelfCheck: 전세가율·부채비율 계산)도 전부 보증금 있는 임차 계약 전용이다.
   그래서 "매매"를 고르면 제목만 매매로 바뀐 채 내용은 그대로 전세 이야기가 나왔다 —
   고를 수 있다는 것 자체가 매매 진단이 있다는 거짓 약속이었다.
   보증금을 지키는 확인 절차라는 이 화면의 실제 성격(전세·월세 공통)을 제목에 고정하고,
   매매는 준비 중이라고 문장으로 밝힌다. */

/* 실제 진단 시 대조하는 항목 안내 — 판정값 없이 항목만 (지어낸 결과 금지) */
const CHECK_ITEMS = [
  {
    label: "소유자 = 계약 상대방 일치",
    how: "등기부등본 갑구에서 소유자 확인 · 신분증 대조",
  },
  {
    label: "깡통전세 위험 (매매가 대비 보증금+선순위 채권)",
    how: "통상 80% 초과 시 위험 신호 · 실거래가와 비교",
  },
  {
    label: "선순위 근저당·가압류",
    how: "등기부등본 을구 확인 · 잔금일 말소 특약 필요 여부",
  },
  {
    label: "불법 건축물 여부",
    how: "건축물대장에서 위반건축물 표기 확인",
  },
  {
    label: "임대인 세금 체납",
    how: "계약 전 국세·지방세 완납증명 열람 동의 요청",
  },
  {
    label: "HUG·SGI 보증보험 가입 가능성",
    how: "보증금·주택 요건 충족 여부를 공사 홈페이지에서 조회",
  },
] as const;

export default function SafetyPage() {
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const submit = () => {
    const q = address.trim();
    if (!q) return;
    setSubmitted(q);
    // 실제로 동작하는 자가진단으로 연결 — 대상 프리필 후 스크롤
    requestAnimationFrame(() => {
      document
        .getElementById(SELF_CHECK_ANCHOR_ID)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });
  };

  return (
    <PageShell breadcrumb="전세·월세 모드 › 세입자 안전 분석" wide>
      {/* [970 · A-35] h1 은 화면의 실제 제목("계약 전, 보증금을 지키는 6가지 확인")으로 — 예전엔
          입력줄 옆 13px 라벨이 h1 이었고 그 문장은 아래 카드 제목으로 따로 있었다.
          입력줄 라벨은 aria-label(입력)로 옮긴다. */}
      <h1 className="rise-in mb-3 t-title tracking-[-0.4px] text-ink max-md:mb-2">
        계약 전, 보증금을 지키는 6가지 확인
      </h1>
      {/* 대상 입력 */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-3 max-md:mb-3 max-md:gap-2">
        <span className="t-body font-bold text-ink">전세·월세 보증금 안전 확인</span>
        <input
          aria-label="주소 또는 단지명"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder="주소 또는 단지명"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary"
        />
        {/* [970 · A-35] disabled:opacity-50 제거 — btn-primary 가 이미 :disabled 를 토큰으로
            처리해 두 번 흐려졌다 */}
        <button
          type="button"
          onClick={submit}
          disabled={!address.trim()}
          className="btn-primary rounded-lg px-4 py-2 text-[13px]"
        >
          안전 진단
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3.5 max-md:gap-3">
          {/* 진단 상태 — 결과를 지어내지 않는다. [1015 · 규칙 B·D] 사용법 문단 → 사실 두 줄 */}
          {submitted ? (
            <div className="rise-in-1 card flex flex-col gap-2.5 rounded-3xl p-[22px] max-md:p-3.5">
              <div className="t-section text-ink">
                “{submitted}” 전세·월세 안전 진단
              </div>
              <p className="t-body leading-[1.7] text-text-2">
                아래 자가진단에 연결됨. 등기부·건축물대장 자동 대조는 준비 중이라 자동 판정은 없음.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {/* [1015 · 규칙 J] 채움 파랑은 상단 "안전 진단" 하나 — 보조는 outline */}
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(SELF_CHECK_ANCHOR_ID)
                      ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
                  }
                  className="btn-outline rounded-lg px-4 py-2.5 text-xs"
                >
                  자가진단으로 확인하기
                </button>
                <Link
                  href="/notes/new"
                  className="btn-secondary rounded-lg px-4 py-2.5 text-xs no-underline"
                >
                  이 집 임장노트 쓰기
                </Link>
              </div>
            </div>
          ) : (
            /* [1015 · 규칙 B·J] h1 과 같은 제목을 되풀이하던 카드 → 사실 한 줄 */
            <p className="rise-in-1 t-sub text-text-3">
              주소 입력 뒤 “안전 진단” → 아래 자가진단에 연결, 지역 실거래 평균으로 매매가 칸 채움 가능 · 등기부 자동 분석은 준비 중
            </p>
          )}

          {/* 세입자 체크리스트 — 항목·확인 방법 안내 (판정값 없음). [1015 · 규칙 I] 행 목록 → 리퀴드 판(sand = 주의·확인) */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-3xl p-[22px] max-md:p-3.5">
            <div className="t-section text-ink">세입자 체크리스트</div>
            <div data-tone="sand" className="lq-panel flex flex-col divide-y">
              {CHECK_ITEMS.map((c) => (
                <div key={c.label} className="flex flex-col gap-0.5 py-[9px]">
                  <span className="t-body font-bold text-text-1">{c.label}</span>
                  <span className="t-sub text-text-3">{c.how}</span>
                </div>
              ))}
            </div>
            <div className="t-caption leading-[1.6] text-text-3">
              등기부등본: 인터넷등기소(iros.go.kr) · 건축물대장: 정부24(gov.kr). 임차(전세·월세) 계약 기준, 매매 계약 위험 진단은
              준비 중.
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3.5 max-md:gap-3">
          <div className="rise-in-3">
            <AIPanel title="계약 전 필수 3가지" className="rounded-3xl">
              ① 잔금일에 <b className="text-ai-accent">근저당 말소 동시 진행</b>{" "}
              특약 ② 전입신고+확정일자 즉시 (대항력) ③ 임대인 국세 완납증명 요청,
              거부 시 계약 재고
            </AIPanel>
          </div>
          {/* [1015 · 규칙 D] 물음형 제목("뭐가 유리할까")·권유 문장 → 명사 + 사실 한 줄 */}
          <div className="rise-in-4 card flex flex-col gap-2 rounded-3xl p-[18px] max-md:p-3.5">
            <div className="t-body font-bold text-ink">전세 · 월세 · 매수 월 부담 비교</div>
            <p className="text-xs leading-[1.6] text-text-2">대출 금리·기회비용 입력 기준</p>
            <Link
              href="/calculator"
              className="btn-soft mt-1 rounded-lg p-2.5 text-center text-xs no-underline"
            >
              대출·비용 계산기
            </Link>
          </div>
        </aside>
      </div>

      {/* 전세 안심 진단(자가진단) — 입력 기반 계산 + 실거래 평균 조회 (F27 lite) */}
      <JeonseSelfCheck subject={submitted} />
    </PageShell>
  );
}
