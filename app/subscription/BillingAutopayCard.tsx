/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import Link from "next/link";
import { planLabel } from "@/lib/subscriptions/labels";

/**
 * 자동결제 상태 카드 (요금제 화면의 구독 패널 안) — 상태·다음 결제일·카드.
 *
 * 서버(BillingPanel)가 넘겨주는 값은 공개 필드뿐이다 — billingKey·customerKey 는
 * 서버 저장소 밖으로 나오지 않는다.
 *
 * [1000] 즉시 해지 버튼을 뺐다 — 해지는 사유·안내가 있는 구독 관리(/my/subscription#manage)
 * 한 곳에서만 한다. 같은 일을 두 화면이 다르게 하면(여기는 두 번 클릭, 저기는 모달)
 * 어느 쪽이 진짜인지 아무도 모른다. 결제 실패로 멈춘 구독의 "카드 다시 등록" 은
 * 가장 급한 행동이라 그대로 둔다. 상태 없는 서버 컴포넌트가 됐다(클라이언트 JS 0).
 */

type Props = {
  plan: string;
  billing: string;
  amount: number;
  status: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  nextChargeAt: string | null;
  /** [966] 이용 만료(app_users.plan_expires_at) */
  planExpiresAt?: string | null;
};

/* 플랜명은 단일 출처를 쓴다 — 지역 맵은 곧 다른 화면과 어긋난다. */

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* [v4 · 규칙 5] 패널 안의 테두리 카드(카드 안에 카드) → 1px 선 아래 행 하나. 문장 → 사실 줄.
   [v4 · 규칙 2] "카드 다시 등록"은 테두리 버튼 — 요금제 화면의 채움 파랑은 결제 CTA 하나다(멈춤 사실은 경고색 글자로). */
export function BillingAutopayCard(props: Props) {
  const suspended = props.status === "suspended";
  const card =
    props.cardCompany || props.cardNumberMasked
      ? `${props.cardCompany ?? "카드"} ${props.cardNumberMasked ?? ""}`.trim()
      : null;

  return (
    <div className="flex flex-col gap-1 border-b border-line py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 t-body font-bold text-ink">
          자동결제 {suspended ? "일시중단" : "이용 중"} · {planLabel(props.plan)}{" "}
          {props.billing === "annual" ? "연간" : "월간"}
        </span>
        <span className="shrink-0 t-body t-num text-ink">
          {props.amount.toLocaleString("ko-KR")}원/{props.billing === "annual" ? "년" : "월"}
        </span>
      </div>
      <p className="t-sub text-text-3">
        {card ? `${card} · ` : null}
        {suspended ? (
          <b className="text-warning">결제 실패로 자동결제 멈춤 · 카드 다시 등록 시 이어서 이용</b>
        ) : (
          <>
            다음 결제 <b className="text-text-1">{fmtDate(props.nextChargeAt)}</b>
            {props.planExpiresAt ? ` · 이용 기간 ${fmtDate(props.planExpiresAt)}까지` : ""}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {suspended && (
          <Link
            href={`/subscription/billing?tier=${props.plan}&billing=${props.billing}&mode=card`}
            className="btn-outline btn-sm no-underline"
          >
            카드 다시 등록
          </Link>
        )}
        <Link
          href="/my/subscription#manage"
          className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline"
        >
          해지·카드 변경은 구독 관리에서 ›
        </Link>
      </div>
    </div>
  );
}
