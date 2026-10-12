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
  type ProfilePatch,
} from "./profile-fields";
import {
  BIO_MAX,
  HANDLE_MAX,
  HANDLE_MIN,
  normalizeHandle,
  validateBio,
  validateHandle,
} from "@/lib/account/profile-handle";

/**
 * [1000] 프로필 편집 시트 — 이름·관심 지역. /my 히어로(관심 지역 칩·"프로필 편집")와
 * 설정 › 계정 탭("편집")이 같은 시트를 연다.
 *
 * 저장은 PATCH /api/me/profile(바뀐 필드만) → 토스트 → router.refresh(). 서버 화면(/my)은
 * refresh 로 새 값을 받고, 설정 탭처럼 클라이언트가 직접 fetch 한 값은 onSaved 로 갱신한다.
 * persona·intentHorizon 은 API 가 받긴 하지만 어느 화면도 읽지 않아 여기서 만들지 않는다.
 *
 * [1058] 공개 이름 · 핸들 · 소개.
 *  · "공개 노트와 댓글에 이 이름이 보여요" 는 사실이 아니었다 — 글·댓글·노트는 로그인 때 굳은 세션 이름을
 *    저장했고 이 시트는 app_users.name 만 바꿨다. 이제 쓰기 라우트가 app_users.name 을 먼저 읽는다
 *    (lib/account/display-name) — **새로 쓰는** 글부터이고, 지난 글의 이름은 그대로다.
 *  · 핸들(profiles.handle)은 공개 프로필 주소 /u/<handle>. 없으면 이름으로 찾는다(같은 이름이 여럿이면 못 찾는다).
 *  · 소개(profiles.bio)는 공개 프로필 이름 밑 한 줄.
 *  핸들·소개는 호출부(/my 히어로·설정 탭)가 initial 에 싣지 않으므로 시트를 열 때 GET /api/me/profile 로 받는다.
 */

type Variant =
  /** 히어로: 관심 지역 칩(.lg-pill) + "프로필 편집" 텍스트 버튼 */
  | "hero"
  /** 설정 행: "편집" 버튼 하나 */
  | "button";

/** 호출부가 핸들·소개까지 알면 실어 보낼 수 있다(없으면 시트가 받아 온다) */
export type ProfileSheetInitial = ProfileInitial & { handle?: string | null; bio?: string | null };

export type ProfileEditSheetProps = {
  initial: ProfileSheetInitial;
  variant?: Variant;
  /** 클라이언트 호출부(설정 탭)만 — 서버 컴포넌트는 함수를 넘길 수 없다 */
  onSaved?: (next: ProfileInitial) => void;
};

type PublicFields = { handle: string | null; bio: string | null };
/** 핸들·소개 — 받아 오는 중 · 받음 · 못 받음(두 칸을 잠근다 — 빈 값으로 덮어쓰지 않게) */
type PublicState = { phase: "loading" } | { phase: "ready"; value: PublicFields } | { phase: "failed" };

const inputCls =
  "w-full rounded-xl border border-line bg-bg px-3 py-2.5 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";

export function ProfileEditSheet({ initial, variant = "hero", onSaved }: ProfileEditSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const nameId = useId();
  const handleId = useId();
  const bioId = useId();
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name ?? "");
  const [region, setRegion] = useState(initial.primaryRegion ?? "");
  const [handle, setHandle] = useState(initial.handle ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [pub, setPub] = useState<PublicState>({ phase: "loading" });
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

  /* [1058] 핸들·소개 — initial 에 있으면 그대로, 없으면 열 때 한 번 받는다(닫혀 있을 땐 요청 없음) */
  useEffect(() => {
    if (!open) return;
    if (initial.handle !== undefined && initial.bio !== undefined) {
      setHandle(initial.handle ?? "");
      setBio(initial.bio ?? "");
      setPub({ phase: "ready", value: { handle: initial.handle ?? null, bio: initial.bio ?? null } });
      return;
    }
    let cancelled = false;
    setPub({ phase: "loading" });
    (async () => {
      try {
        const res = await fetch("/api/me/profile", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          profile?: { handle?: string | null; bio?: string | null; publicProfileOk?: boolean };
        };
        if (cancelled) return;
        if (!data.profile || data.profile.publicProfileOk === false) {
          setPub({ phase: "failed" });
          return;
        }
        const value = { handle: data.profile.handle ?? null, bio: data.profile.bio ?? null };
        setHandle(value.handle ?? "");
        setBio(value.bio ?? "");
        setPub({ phase: "ready", value });
      } catch {
        if (!cancelled) setPub({ phase: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initial.handle, initial.bio]);

  const groups = useMemo(() => groupRegionOptions(ACTIVE_REGION_CATALOG), []);
  const legacyRegion =
    initial.primaryRegion && !isKnownRegion(initial.primaryRegion, ACTIVE_REGION_CATALOG)
      ? initial.primaryRegion.trim()
      : null;

  const validation = validateProfileDraft({ name, primaryRegion: region });
  const handleV = validateHandle(handle);
  const bioV = validateBio(bio);
  const pubEditable = pub.phase === "ready";

  /* 바뀐 필드만 — 핸들·소개는 받아 온 값과 견준다(못 받았으면 보내지 않는다) */
  const patch: (ProfilePatch & { handle?: string | null; bio?: string }) | null = (() => {
    if (!validation.ok || !handleV.ok || !bioV.ok) return null;
    const out: ProfilePatch & { handle?: string | null; bio?: string } = {
      ...(buildProfilePatch(validation.draft, initial) ?? {}),
    };
    if (pub.phase === "ready") {
      if (handleV.handle !== pub.value.handle) out.handle = handleV.handle;
      if (bioV.bio !== (pub.value.bio ?? "")) out.bio = bioV.bio;
    }
    return Object.keys(out).length === 0 ? null : out;
  })();
  const fieldError = !validation.ok ? validation.error : !handleV.ok ? handleV.error : !bioV.ok ? bioV.error : null;
  const canSave = patch !== null && !busy;

  async function save() {
    if (fieldError) {
      setError(fieldError);
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
        profile?: { name?: string | null; primaryRegion?: string | null; handle?: string | null; bio?: string | null };
      };
      if (!res.ok) {
        /* 409 "이미 쓰는 핸들" · 400 검증 · 500 저장 실패 — 서버 문장 그대로 */
        setError(data.error ?? "프로필 저장 실패 · 잠시 후 다시");
        return;
      }
      const draftName = validation.ok ? validation.draft.name : name;
      const draftRegion = validation.ok ? validation.draft.primaryRegion : region;
      const next: ProfileInitial = {
        name: data.profile?.name ?? draftName,
        primaryRegion: data.profile?.primaryRegion ?? (draftRegion || null),
      };
      if (pub.phase === "ready") {
        setPub({
          phase: "ready",
          value: {
            handle: data.profile?.handle ?? (patch.handle !== undefined ? patch.handle : pub.value.handle),
            bio: data.profile?.bio ?? (patch.bio !== undefined ? patch.bio || null : pub.value.bio),
          },
        });
      }
      showToast(data.warning ? data.warning : "프로필 저장됨");
      onSaved?.(next);
      setOpen(false);
      router.refresh();
    } catch {
      setError("프로필 저장 실패 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  }

  const currentRegion = (initial.primaryRegion ?? "").trim();
  const handlePreview = normalizeHandle(handle);

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
            공개 이름 · 닉네임
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={PROFILE_NAME_MAX}
              autoComplete="nickname"
              placeholder="노트·글·댓글에 표시될 이름"
              aria-invalid={!validation.ok && validation.field === "name"}
              className={inputCls}
            />
            {/* [1058] "공개 노트와 댓글에 이 이름이 보여요" — 지난 글은 안 바뀐다(저장된 라벨 그대로) */}
            <span className="t-caption font-normal text-text-3">
              1~{PROFILE_NAME_MAX}자 · 새로 쓰는 노트·글·댓글에 보이는 이름 · 지난 글은 그대로
            </span>
          </label>

          {/* [1058] 핸들 — 공개 프로필 주소. 선택 항목 */}
          <label htmlFor={handleId} className="flex flex-col gap-1 t-sub font-bold text-text-2">
            핸들 · 프로필 주소
            <input
              id={handleId}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={HANDLE_MAX + 1}
              disabled={!pubEditable}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              placeholder="영문 소문자·숫자·밑줄"
              aria-invalid={!handleV.ok}
              className={`${inputCls} disabled:opacity-60`}
            />
            <span className="t-caption font-normal text-text-3">
              {pub.phase === "loading"
                ? "핸들 불러오는 중"
                : pub.phase === "failed"
                  ? "핸들·소개 불러오기 실패 · 잠시 후 다시"
                  : handlePreview
                    ? `naezipnow.com/u/${handlePreview} · ${HANDLE_MIN}~${HANDLE_MAX}자`
                    : "핸들 없음 · 이름으로 찾기"}
            </span>
          </label>

          {/* [1058] 소개 — 공개 프로필 이름 밑 한 줄. 선택 항목 */}
          <label htmlFor={bioId} className="flex flex-col gap-1 t-sub font-bold text-text-2">
            소개
            <textarea
              id={bioId}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX * 2}
              rows={2}
              disabled={!pubEditable}
              placeholder="공개 프로필에 보이는 한 줄"
              aria-invalid={!bioV.ok}
              className={`${inputCls} resize-none disabled:opacity-60`}
            />
            <span className="t-caption font-normal text-text-3">
              {bioV.ok ? `${bioV.bio.length}/${BIO_MAX}자` : bioV.error}
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
