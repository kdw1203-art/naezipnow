"use client";

import { useState } from "react";
import Link from "next/link";
import type { NoteDraft } from "@/lib/ai/note-draft-core";

/* [944 · AI 대개편] 작성 화면의 "AI 초안 받기" 패널.
 *
 * 계약:
 *  - 지역이 정해져야 활성(무엇의 초안인지가 먼저다).
 *  - 생성 결과는 onApply 로 폼에 넘기고, 여기서는 상태·라벨만 그린다.
 *  - 점수가 포함된 초안에는 "AI 추정 · 현장 확인 전" 라벨과 근거 한 줄이 반드시
 *    함께 보인다 — 라벨 없는 추정 점수는 지어낸 값과 같다.
 *  - 한도 소진은 오류가 아니라 상태: 남은 횟수/플랜 안내로 그린다. */

type Usage = { used: number; limit: number | null; plan: string };

export function AiDraftPanel({
  region,
  aptName,
  complexId,
  purpose,
  disabled,
  emphasize = false,
  guest = false,
  onLoginNeeded,
  onApply,
}: {
  region: string;
  aptName: string;
  complexId: string | null;
  /** 방문 목적 칩 선택값 — 초안 프롬프트에 반영 */
  purpose: string | null;
  /** 수정 모드 등 패널을 잠글 때 */
  disabled?: boolean;
  /** [945 #12] /welcome·AI 의도 진입 — 관심지역 브리핑 패널을 시각적으로 앞세운다 */
  emphasize?: boolean;
  /** [1005 · A2] 비회원 — /api/ai/note-draft 는 401 이라 버튼이 로그인 안내로 바뀐다 */
  guest?: boolean;
  /** 로그인이 필요할 때(비회원 버튼·401) 부른다 — 소프트 가입 프롬프트 */
  onLoginNeeded?: () => void;
  onApply: (draft: NoteDraft) => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "applied" | "quota" | "error">("idle");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [applied, setApplied] = useState<NoteDraft | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ready = region.trim().length > 0 && !disabled;

  async function run() {
    if (state === "busy" || !ready) return;
    /* 비회원은 요청을 보내지 않는다 — 401 을 조용히 받는 대신 로그인으로 잇는다 */
    if (guest) {
      onLoginNeeded?.();
      return;
    }
    setState("busy");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ai/note-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionName: region.trim(),
          aptName: aptName.trim() || undefined,
          complexId: complexId ?? undefined,
          purpose: purpose ?? undefined,
        }),
      });
      if (res.status === 401) {
        setErrorMsg("AI 초안 · 로그인 필요");
        setState("error");
        onLoginNeeded?.();
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        draft?: NoteDraft;
        usage?: Usage;
        error?: string;
      };
      if (json.usage) setUsage(json.usage);
      if (json.ok === false && json.reason === "quota") {
        setState("quota");
        return;
      }
      if (!res.ok || !json.ok || !json.draft) {
        setErrorMsg(json.error ?? "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        /* [1015] 문구는 그대로 — 오류 한 줄은 대화체 허용 */
        setState("error");
        return;
      }
      onApply(json.draft);
      setApplied(json.draft);
      setState("applied");
    } catch {
      setErrorMsg("연결이 불안정해요. 잠시 후 다시 시도해 주세요.");
      setState("error");
    }
  }

  const hasScores =
    applied != null && (Object.keys(applied.checks).length > 0 || applied.satisfaction != null);

  return (
    /* [1015 · 규칙 C·J] 파란 색면·링 → 흰 카드 + 1px 선(.card). 버튼은 outline — 이 화면의 채움 파랑은 저장 하나.
       강조(emphasize)는 테두리 굵기로만. */
    <section className={`card rounded-2xl p-[13px] ${emphasize ? "border-line-strong" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="t-body font-bold text-ink">
            {emphasize && region.trim() ? `${region.trim()} AI 초안` : "AI 초안"}
          </div>
          <p className="mt-0.5 t-caption text-text-2">
            {emphasize && region.trim()
              ? `${region.trim()} 실거래·시세·공급 데이터로 초안 작성`
              : /* [1011] 재료 나열을 걷었다(소유자 지시). "현장 확인이 본편"은 남긴다 —
                   초안을 결론으로 오해하지 않게 하는 정직성 문구다. */
                "방문 전 예습용 초안. 현장 확인이 본편."}
          </p>
        </div>
        {state !== "applied" && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={!ready || state === "busy"}
            className="btn-outline min-h-10 rounded-xl px-3.5 py-2 t-sub font-bold disabled:opacity-50"
          >
            {state === "busy" ? "초안 만드는 중…" : guest ? "로그인하고 AI 초안 받기" : "AI 초안 받기"}
          </button>
        )}
      </div>

      {!ready && !disabled && (
        <p className="mt-1.5 t-caption text-text-3">단지 또는 지역을 먼저 선택</p>
      )}

      {state === "applied" && applied && (
        <div className="mt-2 rounded-xl bg-bg px-3 py-2.5">
          <p className="t-sub font-bold text-primary">초안 적용됨. 아래에서 고쳐 쓰기.</p>
          {hasScores && (
            <p className="mt-1 t-caption text-text-2">
              <b className="text-warning">점수는 AI 추정(현장 확인 전)</b>
              {applied.scoreRationale ? ` · ${applied.scoreRationale}` : ""} · 방문 후 조정
            </p>
          )}
          {applied.evidence.length > 0 && (
            <p className="mt-1 t-caption text-text-3">
              데이터 근거 {applied.evidence.length}줄 메모에 포함(출처·시점)
            </p>
          )}
        </div>
      )}

      {state === "quota" && (
        <p className="mt-2 t-caption text-text-2">
          이번 달 AI 초안 {usage?.limit ?? ""}회를 모두 썼어요.{" "}
          {usage?.plan === "free" ? (
            <>
              <Link href="/subscription" className="inline-block py-[5px] font-bold text-primary underline">
                플러스
              </Link>
              에서는 월 100회까지 쓸 수 있어요.
            </>
          ) : (
            "다음 달 1일에 초기화됩니다."
          )}
        </p>
      )}

      {state === "error" && errorMsg && (
        <p role="alert" className="mt-2 t-caption font-semibold text-danger">
          {errorMsg}
        </p>
      )}

      <p className="mt-2 t-caption text-text-3">
        AI 초안은 공개 데이터 기반 참고용이며, 투자 판단의 책임은 이용자 본인에게 있습니다.
        {usage && usage.limit != null && state !== "quota"
          ? ` · 이번 달 ${usage.used}/${usage.limit}회`
          : ""}
      </p>
    </section>
  );
}
