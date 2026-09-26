"use client";

/**
 * 임장러 팔로우 버튼 (당근/SNS 벤치마크) — user_follows 실배선
 * - 로그인 상태 확인은 GET /api/me/follows?checkHandle= (401 → A3 소프트 가입 프롬프트)
 * - 팔로우: POST /api/me/follows { handle } · 언팔로우: DELETE (이메일 비노출)
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useToast } from "@/app/components/toast/ToastProvider";

export function FollowButton({ handle }: { handle: string }) {
  const pathname = usePathname();
  const { promptSignup } = useSoftSignup();
  const { showToast } = useToast();
  const [state, setState] = useState<"loading" | "anon" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);

  const askSignup = () =>
    promptSignup({
      action: "follow_user",
      title: "이 임장러를 팔로우할까요?",
      benefit: "가입하면 이 사람이 새 임장노트를 공개할 때 피드에서 먼저 볼 수 있어요.",
      callbackUrl: pathname ?? "/",
    });

  useEffect(() => {
    let alive = true;
    /* [1007 · V2a-2] 로그인 힌트(nz_authed)가 없으면 401 을 맞으러 가지 않는다 — 결과는 같은 anon */
    if (!readAuthedHint()) {
      setState("anon");
      return () => {
        alive = false;
      };
    }
    fetch(`/api/me/follows?checkHandle=${encodeURIComponent(handle)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) {
          setState("anon");
          return;
        }
        if (!res.ok) {
          setState("off");
          return;
        }
        const data = (await res.json()) as { following?: boolean };
        setState(data.following ? "on" : "off");
      })
      .catch(() => alive && setState("off"));
    return () => {
      alive = false;
    };
  }, [handle]);

  /* [1009 · T] 결과 반응 — 켜면 체크가 한 번 튀고(njn-pop-once), 끄면 토스트에 "되돌리기"(같은 API 로 다시 팔로우).
     busy 동안 버튼 안에 도는 링. 실패는 원인+해결("잠시 후 다시 눌러 주세요"). */
  const [pop, setPop] = useState(0);
  const busyRef = useRef(false);
  const send = async (follow: boolean, undo = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/me/follows", {
        method: follow ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      if (res.status === 401) {
        askSignup();
        return;
      }
      if (!res.ok) {
        showToast(follow ? "팔로우하지 못했어요 — 다시 눌러 주세요" : "취소하지 못했어요 — 다시 눌러 주세요");
        return;
      }
      setState(follow ? "on" : "off");
      if (follow) setPop((n) => n + 1);
      if (undo) showToast(follow ? "다시 팔로우했어요" : "팔로우를 취소했어요");
      else if (follow) showToast("팔로우했어요");
      else showToast("팔로우를 취소했어요", { label: "되돌리기", onClick: () => void send(true, true) });
    } catch {
      showToast("연결이 끊겼어요 — 다시 눌러 주세요");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const toggle = () => {
    if (busy || state === "loading") return;
    if (state === "anon") {
      askSignup();
      return;
    }
    void send(state !== "on");
  };

  const following = state === "on";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || state === "loading"}
      aria-pressed={following}
      aria-busy={busy || undefined}
      className={`press mb-1 inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-full px-4 py-[7px] text-[12px] font-bold transition-colors ${
        following ? "border border-line bg-surface text-text-2" : "bg-primary text-white"
      } ${busy ? "opacity-80" : ""}`}
    >
      {busy ? (
        <span className={`njn-ring ${following ? "njn-ring--ink" : ""}`} aria-hidden="true" />
      ) : following ? (
        <Icon key={`f${pop}`} name="check" size={13} strokeWidth={2.6} className={pop ? "njn-pop-once" : ""} />
      ) : null}
      {state === "loading" ? "…" : following ? "팔로잉" : "팔로우"}
    </button>
  );
}
