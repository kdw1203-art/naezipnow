"use client";

/* I5 매물 부스트 셀프서비스(포인트 500P·7일) — POST /api/listings/[id]/boost.
   오클릭 방지 2단계 확인. 401→SoftSignup, 402→포인트 상점 페이월. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";

export function BoostButton({ listingId, active }: { listingId: string; active: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { promptSignup } = useSoftSignup();
  const { promptUpgrade } = useUpgradePaywall();
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy">("idle");

  async function run() {
    setPhase("busy");
    try {
      const res = await fetch(`/api/listings/${listingId}/boost`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (res.status === 401) {
        promptSignup({
          action: "listing_boost",
          /* [1028 · 제안 5] 다른 가입 안내와 같은 꼴 — "~하려면 로그인이 필요해요" + 짧은 사실 한 줄(값은 아래 버튼과 같다: 500P·7일) */
          title: "로그인 필요 · 부스트",
          benefit: "매물 상단 노출 7일 · 포인트 500P",
          callbackUrl: "/my/listings",
        });
        setPhase("idle");
        return;
      }
      if (res.status === 402) {
        promptUpgrade({
          title: "포인트가 부족해요",
          message: json.error ?? "부스트에는 500P가 필요해요. 포인트는 출석·노트 공개 같은 활동으로 모을 수 있어요.",
          href: "/points/shop",
          ctaLabel: "포인트 상점 가기",
        });
        setPhase("idle");
        return;
      }
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "부스트 실패");
        setPhase("idle");
        return;
      }
      showToast(active ? "부스트를 7일 연장했어요" : "7일 상단 노출을 시작했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
      setPhase("idle");
    }
  }

  if (phase === "confirm") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={() => void run()} className="btn-primary btn-sm press">
          500P 사용
        </button>
        <button type="button" onClick={() => setPhase("idle")} className="btn-ghost btn-sm">
          취소
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPhase("confirm")}
      disabled={phase === "busy"}
      className="btn-primary btn-sm press disabled:opacity-50"
    >
      {active ? "부스트 연장 (500P)" : "노출 부스트 (500P·7일)"}
    </button>
  );
}
