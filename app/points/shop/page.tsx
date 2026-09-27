/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 4곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { getBalance } from "@/lib/points/ledger";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { SPEND_ITEMS, POINTS_GRATUITOUS_NOTICE } from "@/lib/points/catalog";
import { ShopClient } from "./ShopClient";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [970 · C-25] 접미 없던 제목을 buildPageMetadata 경유(`| 내집나우` 자동)로 + description.
   비로그인에게도 열린 공개 페이지(robots allow · 사이트맵 수록)라 canonical 도 같이 붙는다. */
export const metadata = buildPageMetadata({
  title: "포인트 상점",
  description:
    "활동으로 쌓은 포인트를 매물 상단 노출·닉네임 꾸미기 같은 서비스 내 혜택으로 교환해요. 현금 전환·구매는 안 돼요.",
  path: "/points/shop",
});

/* ── 비로그인 안내 (상품은 미리보기로 노출) ──
   [v4 · 한 화면 한 가지] 네이비 가운데 패널(아이콘 · 문장 두 줄) → 제목 한 줄 + 사실 한 줄 + 로그인 버튼(채움 1개) →
   상품 1px 선 행(오른쪽 포인트). 높이가 다른 카드 격자(엇갈림) 없음. */
function GuestView() {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <header className="rise-in flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="t-title text-ink">포인트 상점</h1>
          <p className="t-sub text-text-3">
            교환 상품 {SPEND_ITEMS.length}가지 · 서비스 안 혜택 · 현금 전환 없음
          </p>
        </div>
        <Link href="/login?callbackUrl=/points/shop" className="btn-primary btn-md self-start no-underline">
          로그인하고 포인트 보기
        </Link>
      </header>

      <ul data-tone="mint" className="rise-in-1 divide-y divide-line">
        {SPEND_ITEMS.map((item) => (
          <li key={item.key} className="flex min-h-14 items-center justify-between gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block t-body font-bold text-ink">
                {item.label}
                {item.season && <span className="ml-1.5 t-caption font-bold text-warning">{item.season} 한정</span>}
              </span>
              <span className="mt-0.5 block truncate t-sub text-text-3">{item.desc}</span>
            </span>
            <span className="shrink-0 t-body t-num text-ink">{item.cost.toLocaleString("ko-KR")}P</span>
          </li>
        ))}
      </ul>
      <p className="rise-in-3 t-caption leading-[1.7] text-text-3">{POINTS_GRATUITOUS_NOTICE}</p>
    </div>
  );
}

export default async function PointsShopPage() {
  const session = await safeAuth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <PageShell>
        <GuestView />
      </PageShell>
    );
  }

  /* 잔액 조회가 실패하면 예전에는 0 이 내려와 상점 상단에 "0 P" 가 사실처럼
     찍혔다. 가진 사람에게 없다고 말하는 셈이고, 그 상태로 구매를 누르면
     "포인트가 부족해요" 까지 따라온다. 못 읽었으면 못 읽었다고 쓴다. */
  const loaded = await getBalance(email).then(
    (balance) => ({ ok: true as const, balance }),
    (err: unknown) => {
      logger.error("[points/shop] 잔액 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );

  if (!loaded.ok) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-[760px]">
          <h1 className="mb-3 t-title text-ink">포인트 상점</h1>
          <ErrorState
            title="포인트 상점을 지금 열 수 없어요"
            desc="보유 포인트를 확인하지 못했습니다. 잔액이 0이라는 뜻이 아니라 조회 자체가 실패했어요. 잠시 후 다시 시도해 주세요."
            cause={loaded.cause}
            action={{ label: "포인트 안내로 이동", href: "/points" }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    /* [v4 · 규칙 12] PageShell 브레드크럼(글자뿐)은 본문 줄과 어긋나 뺐다 — 제목은 ShopClient 가 760px 줄 안에서 */
    <PageShell>
      <ShopClient initialBalance={loaded.balance} />
      {/* [992 · A1] "자료실 유료 리포트도 포인트로 구매" 배너 제거 — 자료실(/town/library)은 보관(비노출) */}
      {/* 무상성 고지 — PG 심사·소비자 오인 방지 공용(단일 출처). [v4] 회색 상자 → 끝 캡션 */}
      <p className="mx-auto mt-6 w-full max-w-[760px] t-caption leading-[1.7] text-text-3">
        {POINTS_GRATUITOUS_NOTICE}
      </p>
    </PageShell>
  );
}
