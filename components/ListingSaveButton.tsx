"use client";

/**
 * #1 매물 저장(관심) 토글 — 하트 버튼.
 * POST /api/bookmarks {type:"listing", id} / DELETE ?type=listing&id=.
 * 401 → 로그인 안내. 저장 목록은 /my/wishlist 에서 확인.
 *
 * [1009 · T] 누르는 즉시 바뀐다(낙관적 갱신) — 예전엔 응답이 올 때까지 버튼이 흐려진 채 멈춰 있었다.
 *  - 켤 때: 하트가 채워지며 파문 한 번(njn-burst) + 토스트 "관심 매물에 저장했어요 · 목록 보기".
 *  - 끌 때: 토스트 "관심 매물에서 뺐어요 · 되돌리기"(같은 API 로 다시 저장 — 확인 창 대신).
 *  - 실패하면 원래대로 되돌리고 원인+해결을 말한다. 로그인이 필요하면(401) 되돌리고 가입 안내.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useToast } from "@/app/components/toast/ToastProvider";

export function ListingSaveButton({
  listingId,
  label,
  initialSaved = false,
  className,
}: {
  listingId: string;
  label?: string | null;
  initialSaved?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const { showToast } = useToast();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* 파문을 매번 다시 재생 — 키를 바꾼다 */
  const [burst, setBurst] = useState(0);
  const busyRef = useRef(false);

  async function send(next: boolean, undo = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const prev = !next;
    setSaved(next);
    if (next) setBurst((n) => n + 1);
    /* [966] 실패는 인라인 문구 + 토스트 둘 다 — 카드 목록에서는 버튼 아래 문구가
       가려지는 자리가 있어 토스트가 보조한다. 성공은 토스트에 목록 링크를 싣는다. */
    const fail = (msg: string) => {
      setSaved(prev);
      setError(msg);
      showToast(msg);
    };
    try {
      const res = next
        ? await fetch("/api/bookmarks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "listing", id: listingId, label: label ?? null }),
          })
        : await fetch(`/api/bookmarks?type=listing&id=${encodeURIComponent(listingId)}`, { method: "DELETE" });
      if (res.status === 401) {
        setSaved(prev);
        promptSignup({
          action: "bookmark_listing",
          title: "관심 매물을 저장하려면 로그인이 필요해요",
          benefit: "로그인하면 마이페이지 위시리스트에서 다시 볼 수 있어요.",
          callbackUrl: `/listings/${listingId}`,
        });
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        fail(data.error ?? (next ? "저장하지 못했어요 — 다시 눌러 주세요" : "빼지 못했어요 — 다시 눌러 주세요"));
        return;
      }
      if (undo) showToast(next ? "다시 저장했어요" : "관심 매물에서 뺐어요");
      else if (next) showToast("관심 매물에 저장했어요", { label: "목록 보기", href: "/my/wishlist" });
      else showToast("관심 매물에서 뺐어요", { label: "되돌리기", onClick: () => void send(true, true) });
      router.refresh();
    } catch {
      fail("연결이 끊겼어요 — 다시 눌러 주세요");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void send(!saved)}
        aria-pressed={saved}
        aria-busy={busy || undefined}
        aria-label={saved ? "관심 매물에서 빼기" : "관심 매물로 저장"}
        className={`chip press inline-flex min-h-[40px] items-center gap-1.5 border px-3 py-1.5 text-[13px] font-bold transition-colors ${
          saved
            ? "border-brand-red bg-brand-hanji text-brand-red"
            : "border-line bg-surface text-text-2 hover:border-brand-red hover:text-brand-red"
        } ${className ?? ""}`}
      >
        {/* [961] 관심 등록 — 하트가 채워지며 주홍 파문 한 번(마커 선택과 같은 리듬) */}
        <span className="relative inline-flex">
          <Icon
            key={`h${burst}`}
            name="heart"
            size={15}
            className={saved && burst ? "njn-pop-once" : ""}
            style={saved ? { fill: "currentColor" } : undefined}
          />
          {saved && burst > 0 && <span key={`b${burst}`} className="njn-burst" aria-hidden="true" />}
        </span>
        {saved ? "관심 저장됨" : "관심"}
      </button>
      {error && <span className="text-[12px] font-bold text-danger">{error}</span>}
    </div>
  );
}
