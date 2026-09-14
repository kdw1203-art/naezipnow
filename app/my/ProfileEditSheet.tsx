"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import { ACTIVE_REGION_CATALOG } from "@/lib/region/catalog";
import {
  PROFILE_NAME_MAX,
  buildProfilePatch,
  groupRegionOptions,
  isKnownRegion,
  validateProfileDraft,
  type ProfileInitial,
} from "./profile-fields";

/**
 * [1000] 프로필 편집 시트 — 이름·관심 지역. /my 히어로(관심 지역 칩·"프로필 편집")와
 * 설정 › 계정 탭("편집")이 같은 시트를 연다.
 *
 * 저장은 PATCH /api/me/profile(바뀐 필드만) → 토스트 → router.refresh(). 서버 화면(/my)은
 * refresh 로 새 값을 받고, 설정 탭처럼 클라이언트가 직접 fetch 한 값은 onSaved 로 갱신한다.
 * persona·intentHorizon 은 API 가 받긴 하지만 어느 화면도 읽지 않아 여기서 만들지 않는다.
 */

type Variant =
  /** 히어로: 관심 지역 칩(.lg-pill) + "프로필 편집" 텍스트 버튼 */
  | "hero"
  /** 설정 행: "편집" 버튼 하나 */
  | "button";

export type ProfileEditSheetProps = {
  initial: ProfileInitial;
  variant?: Variant;
  /** 클라이언트 호출부(설정 탭)만 — 서버 컴포넌트는 함수를 넘길 수 없다 */
  onSaved?: (next: ProfileInitial) => void;
};

const inputCls =
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";

export function ProfileEditSheet({ initial, variant = "hero", onSaved }: ProfileEditSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const nameId = useId();
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name ?? "");
  const [region, setRegion] = useState(initial.primaryRegion ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 시트를 열 때마다 서버가 준 최신값으로 되돌린다 — 취소하고 다시 열었을 때
     지난 입력이 남아 있으면 "저장된 줄" 알고 닫는 실수가 생긴다. */
  useEffect(() => {
    if (!open) return;
    setName(initial.name ?? "");
    setRegion(initial.primaryRegion ?? "");
    setError(null);
  }, [open, initial.name, initial.primaryRegion]);

  const groups = useMemo(() => groupRegionOptions(ACTIVE_REGION_CATALOG), []);
  const legacyRegion =
    initial.primaryRegion && !isKnownRegion(initial.primaryRegion, ACTIVE_REGION_CATALOG)
      ? initial.primaryRegion.trim()
      : null;

  const validation = validateProfileDraft({ name, primaryRegion: region });
  const patch = validation.ok ? buildProfilePatch(validation.draft, initial) : null;
  const canSave = validation.ok && patch !== null && !busy;

  async function save() {
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (!patch) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
        profile?: { name?: string | null; primaryRegion?: string | null };
      };
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const next: ProfileInitial = {
        name: data.profile?.name ?? validation.draft.name,
        primaryRegion:
          data.profile?.primaryRegion ?? (validation.draft.primaryRegion || null),
      };
      showToast(data.warning ? data.warning : "프로필을 저장했어요");
      onSaved?.(next);
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const currentRegion = (initial.primaryRegion ?? "").trim();

  return (
    <>
      {variant === "hero" ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* 둘 다 시트를 여는 주요 조작이라 40px(min-h-10)로 맞춘다 */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="lg-pill min-h-10 max-w-full no-underline"
            aria-label={currentRegion ? `관심 지역 ${currentRegion} · 변경` : "관심 지역 설정"}
          >
            <Icon name="map" size={14} className="shrink-0" />
            <span className="truncate">{currentRegion || "관심 지역 설정"}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-10 items-center px-1.5 t-sub font-semibold text-primary"
          >
            프로필 편집
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn-soft btn-md shrink-0">
          편집
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        label="프로필 편집"
        maxWidth={420}
        dismissOnBackdrop={!busy}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <ModalHeader title="프로필 편집" onClose={() => setOpen(false)} />

          <label htmlFor={nameId} className="flex flex-col gap-1 t-sub font-bold text-text-2">
            이름 · 닉네임
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={PROFILE_NAME_MAX}
              autoComplete="nickname"
              placeholder="노트·댓글에 표시될 이름"
              aria-invalid={!validation.ok && validation.field === "name"}
              className={inputCls}
            />
            <span className="t-caption font-normal text-text-3">
              1~{PROFILE_NAME_MAX}자 · 공개 노트와 댓글에 이 이름이 보여요
            </span>
          </label>

          <label htmlFor={regionId} className="flex flex-col gap-1 t-sub font-bold text-text-2">
            관심 지역
            <select
              id={regionId}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={inputCls}
            >
              <option value="">선택 안 함</option>
              {legacyRegion && (
                <option value={legacyRegion}>{legacyRegion} (직접 입력한 값)</option>
              )}
              {groups.map((g) => (
                <optgroup key={g.city} label={g.city}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="t-caption font-normal text-text-3">
              홈 추천·지역 뉴스가 이 지역을 먼저 보여줘요. 알림 구독은 알림함에서 따로 관리해요.
            </span>
          </label>

          {error && (
            <p role="alert" className="t-sub font-bold text-danger">
              {error}
            </p>
          )}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn-soft btn-md flex-1"
            >
              취소
            </button>
            <button type="submit" disabled={!canSave} className="btn-primary btn-md flex-1">
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export default ProfileEditSheet;
