/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import { Icon } from "@/app/components/Icon";
import { Illust, type IllustName } from "@/app/components/Illust";
import { Button } from "./Button";

/* [1012 · 규칙 4·10] 빈 화면 그림 = 직접 그린 선 일러스트(public/illust). 호출부가 이미 넘기던 `icon`(선 아이콘 이름)을
   그림으로 옮긴다 — 이 표에 있는 이름이면 일러스트, 없으면 예전대로 브랜드 심볼(처마 + 숨쉬는 온점). `illust` 를
   직접 넘기면 그것이 우선. 어드민 톤은 그대로 아이콘. */
const ICON_TO_ILLUST: Record<string, IllustName> = {
  "notebook-pen": "empty-notes",
  "file-text": "empty-notes",
  clipboard: "empty-notes",
  book: "empty-notes",
  map: "map-pin",
  pin: "map-pin",
  compass: "map-pin",
  key: "key-door",
  house: "key-door",
  building: "search",
  search: "search",
  calendar: "calendar",
  clock: "calendar",
  bell: "bell",
  "bar": "chart",
  "trending-up": "chart",
  calculator: "chart",
};

/** 라이트(공개 화면) / 어드민(다크 셸) 두 표면. 어드민은 `.dark` 클래스에 의존하지 않고
 *  관리자 셸(bg-[#12161f]) 위에서 직접 성립하도록 고정 색을 씁니다. */
export type StateTone = "light" | "admin";

export type EmptyStateAction = {
  label: string;
  href: string;
};

export type EmptyStateProps = {
  icon?: string;
  /** 직접 고른 일러스트 — 없으면 icon 이름에서 고른다(ICON_TO_ILLUST), 그것도 없으면 브랜드 심볼 */
  illust?: IllustName;
  title: string;
  desc?: string;
  action?: EmptyStateAction;
  tone?: StateTone;
  className?: string;
};

const SHELL: Record<StateTone, string> = {
  light: "card",
  admin:
    "rounded-lg border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)]",
};

const PAD: Record<StateTone, string> = {
  light: "p-[var(--pad-card)]",
  admin: "px-4 py-6",
};

const TITLE: Record<StateTone, string> = {
  light: "t-section font-bold text-ink",
  admin: "t-body font-bold text-white",
};

const DESC: Record<StateTone, string> = {
  light: "t-body leading-[1.6] text-text-3",
  admin: "t-sub leading-[1.6] text-[#9aa6b8]",
};

const ICON_WRAP: Record<StateTone, string> = {
  light: "bg-primary-soft text-primary",
  admin: "bg-[rgba(126,162,255,.15)] text-ai-accent",
};

const ERROR_ICON_WRAP: Record<StateTone, string> = {
  light: "bg-danger-soft text-danger",
  admin: "bg-[rgba(248,113,113,.14)] text-ai-danger",
};

const CAUSE: Record<StateTone, string> = {
  light:
    "rounded-lg bg-bg px-2.5 py-1.5 font-mono t-sub leading-[1.5] text-text-3",
  admin:
    "rounded-lg bg-[rgba(255,255,255,.05)] px-2.5 py-1.5 font-mono t-caption leading-[1.5] text-[#9aa6b8]",
};

const ADMIN_LINK =
  "press inline-flex items-center justify-center rounded-lg bg-[rgba(126,162,255,.15)] px-3.5 py-[7px] t-sub font-bold text-ai-accent no-underline";

function ActionButton({ action, tone }: { action: EmptyStateAction; tone: StateTone }) {
  if (tone === "admin") {
    return (
      <a href={action.href} className={`${ADMIN_LINK} mt-1`}>
        {action.label}
      </a>
    );
  }
  return (
    <Button href={action.href} variant="primary" size="sm" className="mt-1">
      {action.label}
    </Button>
  );
}

/**
 * 데이터가 "없는" 상태 — 조회는 성공했고 결과가 0건일 때만 씁니다.
 * 조회가 실패했을 때 이걸 쓰면 "없다"는 거짓말이 되므로 ErrorState 를 쓰세요.
 */
export function EmptyState({
  icon,
  illust,
  title,
  desc,
  action,
  tone = "light",
  className = "",
}: EmptyStateProps) {
  const picture: IllustName | null = illust ?? (icon ? (ICON_TO_ILLUST[icon] ?? null) : null);
  return (
    <div
      className={`${SHELL[tone]} ${PAD[tone]} flex flex-col items-center gap-2 text-center ${className}`.trim()}
      /* [946 리브랜딩 · 모션 07] 공개 화면의 빈 상태 = 숨쉬는 온점. 어드민 톤은 기존 유지.
         [1022 · 정렬·글씨·테마] 한지 면(inline background: var(--brand-hanji)) → 흰 카드(.card 그대로).
         빈 상태 41곳이 이 부품을 쓰는데, 다른 카드는 전부 흰 바탕이라 빈 상태만 노랗게 튀었다(1018 이 한지 판을
         흰색으로 바꾼 것과 같은 이유). 가운데 정렬·온점·그림은 그대로. */
    >
      {tone === "light" && picture ? (
        /* [1015 · 규칙 E] 폰에서는 64px — 빈 화면 그림이 한 화면을 차지하지 않게(데스크톱 96) */
        <Illust name={picture} size={96} className="rounded-lg max-md:h-16 max-md:w-16" />
      ) : tone === "light" ? (
        /* 온점만 숨쉰다(2.4s) — 심볼 전체를 흔들면 장식이 소음이 된다 */
        <svg width="44" height="40" viewBox="0 0 120 120" aria-hidden="true">
          <path
            d="M52 28 L68 28"
            fill="none"
            stroke="var(--brand-symbol-ink)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M14 46 C 38 64, 82 64, 106 46"
            fill="none"
            stroke="var(--brand-symbol-ink)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle
            className="empty-dot-breathe"
            cx="60"
            cy="86"
            r="8.5"
            fill="var(--brand-dot)"
            style={{ transformOrigin: "60px 86px" }}
          />
        </svg>
      ) : (
        icon && (
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${ICON_WRAP[tone]}`}
          >
            <Icon name={icon} size={22} />
          </div>
        )
      )}
      {/* [961] 제목 끝의 마침표 = 주홍 온점(브랜드 시그니처 "지금."). 제목이 문장부호로
          끝나면 붙이지 않는다 — 점이 두 개면 신호가 아니라 오타로 읽힌다. */}
      <p className={TITLE[tone]}>
        {title}
        {tone === "light" && typeof title === "string" && !/[.!?…。]$/.test(title.trim()) && (
          <span className="text-brand-red" aria-hidden="true">
            .
          </span>
        )}
      </p>
      {desc && <p className={DESC[tone]}>{desc}</p>}
      {action && <ActionButton action={action} tone={tone} />}
    </div>
  );
}

/** [1028] 원인 원문을 화면에 낼지 — 관리자 화면은 늘, 방문자 화면은 "오류 코드 …"만.
 *  예전에는 fetch 실패 원문("Failed to fetch")·DB 오류 문장이 방문자 화면의 회색 칸에 그대로 나갔다. */
export function visibleCause(cause: string, tone: StateTone): boolean {
  return tone === "admin" || /^오류 코드 /.test(cause);
}

export type ErrorStateProps = {
  /** 무엇이 안 됐는지. 기본값은 조회 실패. */
  title?: string;
  /** 이용자가 다음에 뭘 하면 되는지. */
  desc?: string;
  /** 원인 원문(에러 메시지 등). [1028] 관리자 화면(tone="admin")에서만 그대로 보인다 — 방문자 화면에는
   *  "오류 코드 …"로 시작하는 짧은 코드(문의할 때 쓰는 값)만 보이고, 영문 오류·DB 메시지 원문은 보이지 않는다. */
  cause?: string;
  action?: EmptyStateAction;
  /** 클라이언트 컴포넌트에서만 — 다시 시도 버튼. */
  onRetry?: () => void;
  retryLabel?: string;
  tone?: StateTone;
  className?: string;
};

/**
 * 조회·처리가 "실패한" 상태. 빈 상태와 구분해서 씁니다 —
 * 실패를 "데이터 없음"으로 표시하거나 목업으로 덮으면 사실이 아닌 화면이 됩니다.
 */
export function ErrorState({
  title = "지금은 불러올 수 없어요",
  desc,
  cause,
  action,
  onRetry,
  retryLabel = "다시 시도",
  tone = "light",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`${SHELL[tone]} ${PAD[tone]} flex flex-col items-center gap-2 text-center ${className}`.trim()}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${ERROR_ICON_WRAP[tone]}`}
      >
        <Icon name="warning" size={22} />
      </div>
      <p className={TITLE[tone]}>{title}</p>
      {desc && <p className={DESC[tone]}>{desc}</p>}
      {cause && visibleCause(cause, tone) && <p className={CAUSE[tone]}>{cause}</p>}
      {(onRetry || action) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry &&
            (tone === "admin" ? (
              <button type="button" onClick={onRetry} className={ADMIN_LINK}>
                {retryLabel}
              </button>
            ) : (
              <Button onClick={onRetry} variant="primary" size="sm">
                {retryLabel}
              </Button>
            ))}
          {action &&
            (tone === "admin" ? (
              <a href={action.href} className={ADMIN_LINK}>
                {action.label}
              </a>
            ) : (
              <Button href={action.href} variant="secondary" size="sm">
                {action.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
