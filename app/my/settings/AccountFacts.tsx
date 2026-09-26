"use client";

import { useEffect, useState } from "react";
import type { AccountFacts } from "@/lib/me/account-facts";
import { formatKstDate } from "@/lib/format/kst";

/**
 * [1006] 설정 › 계정 — 연결된 로그인 수단 · 가입일 · 동의 갱신일.
 * GET /api/me/account 의 사실만 그린다. "연결 안 됨" 은 회색(text-text-3), 연결됨은 잉크색 +
 * 날짜(열이 있을 때만). 지금 이 세션이 열린 수단에는 "지금 로그인 중" 을 붙인다.
 * 동의 상태의 **변경**은 개인정보 탭(같은 화면) — onGoPrivacy 로 탭을 바꾼다.
 */
type Phase = "loading" | "ready" | "error";

export function AccountFactsCards({ onGoPrivacy }: { onGoPrivacy: () => void }) {
  const [facts, setFacts] = useState<AccountFacts | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/account", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return setPhase("error");
        const data = (await res.json()) as { facts?: AccountFacts };
        if (!data.facts) return setPhase("error");
        setFacts(data.facts);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">연결된 로그인</div>
        {phase === "loading" ? (
          <div className="py-4 text-center t-sub text-text-3">불러오는 중…</div>
        ) : phase === "error" || !facts ? (
          <div className="py-4 text-center t-sub text-text-3">
            로그인 연결 상태를 지금 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
          </div>
        ) : (
          facts.logins.map((l, i) => (
            <div
              key={l.provider}
              className={`flex items-center justify-between gap-3 py-3 ${
                i > 0 ? "border-t border-divider" : ""
              }`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="t-body font-semibold text-text-1">{l.label}</span>
                {l.current && <span className="t-caption text-primary">지금 로그인 중</span>}
              </span>
              {l.linked ? (
                <span className="flex shrink-0 flex-col items-end">
                  <span className="rounded-full bg-primary-soft chip-pad t-caption font-extrabold text-primary">
                    연결됨
                  </span>
                  {l.at && <span className="mt-0.5 t-caption text-text-3">{formatKstDate(l.at)}</span>}
                </span>
              ) : (
                <span className="shrink-0 t-sub text-text-3">연결 안 됨</span>
              )}
            </div>
          ))
        )}
        {phase === "ready" && facts && (
          /* [리뷰 M4] 서버에 기록이 없는 소셜(구글·카카오)은 이 세션으로 확인될 때만 줄이 생긴다 —
             안 보이는 줄을 "연결 안 됨"으로 읽지 않게 이유를 적는다 */
          <p className="border-t border-divider py-2.5 t-caption text-text-3">
            구글·카카오는 연결 기록이 있거나 지금 그 수단으로 로그인했을 때만 표시돼요.
          </p>
        )}
      </div>

      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">계정 정보</div>
        {phase === "loading" ? (
          <div className="py-4 text-center t-sub text-text-3">불러오는 중…</div>
        ) : phase === "error" || !facts ? (
          <div className="py-4 text-center t-sub text-text-3">
            계정 정보를 지금 불러오지 못했어요.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-divider py-3">
              <span className="t-body font-semibold text-text-1">가입일</span>
              <span className="t-body text-text-2">
                {facts.createdAt ? formatKstDate(facts.createdAt) : "기록 없음"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-divider py-3">
              <span className="flex min-w-0 flex-col">
                <span className="t-body font-semibold text-text-1">선택 동의</span>
                <span className="t-caption text-text-3">
                  마케팅 {facts.marketing ? "동의" : "미동의"} · 위치정보 {facts.location ? "동의" : "미동의"}
                </span>
              </span>
              <button
                type="button"
                onClick={onGoPrivacy}
                className="inline-flex min-h-10 shrink-0 items-center px-1.5 t-sub font-semibold text-primary"
              >
                개인정보 탭에서 변경 ›
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <span className="t-body font-semibold text-text-1">동의 마지막 갱신</span>
              <span className="t-body text-text-2">
                {facts.consentUpdatedAt ? formatKstDate(facts.consentUpdatedAt) : "갱신 기록 없음"}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
