"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Switch } from "@/app/components/ui/Switch";
import { useToast } from "@/app/components/toast/ToastProvider";
import { DEFAULT_UI_PREFS, type UiPrefs } from "@/lib/prefs/ui-prefs";
import { readAreaUnitCookie, writeAreaUnitCookie } from "@/lib/prefs/area-unit";
import {
  AREA_UNIT_OPTIONS,
  INVESTOR_ROLE_OPTIONS,
  NOTE_VISIBILITY_OPTIONS,
} from "@/lib/me/ui-pref-labels";
import type { UiPrefsPatch } from "@/lib/me/ui-prefs-request";
import { formatKstDateTime } from "@/lib/format/kst";
import { shouldShowSaveToast } from "./save-toast";

/**
 * [1006] 설정 › 기록 — 표시·기록 기본값(UiPrefs).
 *
 * 저장: PATCH /api/me/preferences { uiPrefs: {...} } → 응답의 uiPrefs 로 상태를 덮는다(서버 정규화
 * 결과가 진실). 낙관적으로 먼저 그리고 실패하면 되돌린다 — 알림 탭 토글과 같은 태도.
 * 면적 단위만은 쿠키에도 적는다(lib/prefs/area-unit.ts): 지도·노트 화면이 서버 렌더를
 * 개인화하지 않고 클라이언트에서 쿠키를 읽어 표시만 바꾸기 때문.
 *
 * 주간 다이제스트 수신은 알림 탭이 맡는다(발송 크론이 읽는 곳이 거기다) — 여기서는 안내 한 줄만.
 */
type Phase = "loading" | "ready" | "guest" | "error";

export function RecordPrefsTab({ onGoNotification }: { onGoNotification: () => void }) {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [phase, setPhase] = useState<Phase>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<keyof UiPrefsPatch | null>(null);
  const lastToastAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/preferences", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return setPhase("error");
        const data = (await res.json()) as { authenticated?: boolean; uiPrefs?: UiPrefs };
        if (data.authenticated === false) return setPhase("guest");
        if (!data.uiPrefs) return setPhase("error");
        setPrefs(data.uiPrefs);
        /* 다른 기기에서 저장한 단위가 이 브라우저 쿠키와 다르면 서버 값으로 맞춘다(서버가 진실) */
        if (readAreaUnitCookie() !== data.uiPrefs.areaUnit) writeAreaUnitCookie(data.uiPrefs.areaUnit);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (patch: UiPrefsPatch) => {
      const key = Object.keys(patch)[0] as keyof UiPrefsPatch;
      const prev = prefs;
      setPrefs({ ...prefs, ...patch });
      setSaveError(null);
      setBusyKey(key);
      try {
        const res = await fetch("/api/me/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uiPrefs: patch }),
        });
        const data = (await res.json().catch(() => ({}))) as { uiPrefs?: UiPrefs; error?: string };
        if (!res.ok || !data.uiPrefs) throw new Error(data.error ?? "저장 실패");
        setPrefs(data.uiPrefs);
        /* 쿠키는 서버가 받아 준 값으로 — 요청값이 아니라 저장된 값을 거울로 둔다 */
        if (patch.areaUnit !== undefined) writeAreaUnitCookie(data.uiPrefs.areaUnit);
        const now = Date.now();
        if (shouldShowSaveToast(lastToastAt.current, now)) {
          lastToastAt.current = now;
          showToast("저장했어요");
        }
      } catch (e) {
        setPrefs(prev);
        setSaveError(
          e instanceof Error && e.message !== "저장 실패"
            ? e.message
            : "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [prefs, showToast],
  );

  if (phase === "loading") {
    return (
      <div className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
        기본값을 불러오는 중…
      </div>
    );
  }
  if (phase === "guest") {
    return (
      <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
        <div className="t-body font-extrabold text-ink">로그인하면 기본값을 저장할 수 있어요</div>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent("/my/settings")}`}
          className="btn-primary btn-md no-underline"
        >
          로그인
        </Link>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
        기본값을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
      </div>
    );
  }

  const busy = busyKey !== null;

  return (
    <div className="flex flex-col gap-3">
      {saveError && (
        <div role="alert" className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger">
          {saveError}
        </div>
      )}

      {/* ── 표시 ── */}
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">표시</div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="t-body font-semibold text-text-1">면적 단위</span>
            <span className="t-caption text-text-3">실거래 · 단지 · 노트의 면적을 이 단위로</span>
          </span>
          <div className="lg-capsule shrink-0" role="group" aria-label="면적 단위">
            {AREA_UNIT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={prefs.areaUnit === o.value}
                disabled={busy}
                onClick={() => {
                  if (prefs.areaUnit !== o.value) void save({ areaUnit: o.value });
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 임장노트 기록 ── */}
      <div className="card flex flex-col rounded-2xl px-4 py-1">
        <div className="pb-1 pt-3 t-sub font-extrabold text-text-3">임장노트 기록</div>

        <div className="flex items-center justify-between gap-3 border-b border-divider py-3">
          <span className="flex min-w-0 flex-col">
            <span className="t-body font-semibold text-text-1">기본 공개 범위</span>
            <span className="t-caption text-text-3">새 노트의 시작값 · 정한 적 없으면 비공개 · 노트마다 바꿀 수 있어요</span>
          </span>
          <div className="lg-capsule shrink-0" role="group" aria-label="기본 공개 범위">
            {NOTE_VISIBILITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={prefs.noteVisibilityDefault === o.value}
                disabled={busy}
                onClick={() => {
                  if (prefs.noteVisibilityDefault !== o.value) {
                    void save({ noteVisibilityDefault: o.value });
                  }
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={prefs.noteQuickDefault}
          disabled={busy}
          onClick={() => void save({ noteQuickDefault: !prefs.noteQuickDefault })}
          className="flex w-full items-center justify-between gap-3 border-b border-divider py-[11px] text-left disabled:opacity-60"
        >
          <span className="flex min-w-0 flex-col">
            <span className="t-body font-semibold text-text-1">퀵 기록으로 시작</span>
            <span className="t-caption text-text-3">노트 쓰기를 열면 한 화면 퀵 기록부터 시작</span>
          </span>
          <Switch on={prefs.noteQuickDefault} />
        </button>

        <div className="flex flex-col gap-2 py-3">
          <label htmlFor="ui-pref-investor-role" className="flex min-w-0 flex-col">
            <span className="t-body font-semibold text-text-1">기본 투자자 역할</span>
            <span className="t-caption text-text-3">AI 정리가 점수 가중치를 정할 때 쓰는 관점</span>
          </label>
          <select
            id="ui-pref-investor-role"
            value={prefs.investorRoleDefault ?? ""}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              void save({
                investorRoleDefault: v === "" ? null : (v as NonNullable<UiPrefs["investorRoleDefault"]>),
              });
            }}
            className="min-h-[40px] w-full rounded-xl border border-line bg-bg px-3 t-body text-ink outline-none focus:border-primary disabled:opacity-60"
          >
            {INVESTOR_ROLE_OPTIONS.map((o) => (
              <option key={o.value ?? "none"} value={o.value ?? ""}>
                {o.label} — {o.hint}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* [1006 · 리뷰 H1] 주간 다이제스트는 여기서 켜고 끄지 않는다 — 발송 크론은 알림 탭의
          설정(notification_preferences)만 읽는다. 여기 토글을 두면 어디에도 닿지 않는 죽은 스위치다. */}
      <div className="card flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <span className="t-sub text-text-2">주간 다이제스트 수신은 알림 탭에서 켜고 끌 수 있어요</span>
        <button
          type="button"
          onClick={onGoNotification}
          className="inline-flex min-h-10 shrink-0 items-center px-1.5 t-sub font-bold text-primary"
        >
          알림 탭 ›
        </button>
      </div>

      <div className="t-caption text-text-3">
        변경 즉시 저장돼요
        {prefs.updatedAt ? ` · 마지막 저장 ${formatKstDateTime(prefs.updatedAt)}` : ""}
      </div>
    </div>
  );
}
