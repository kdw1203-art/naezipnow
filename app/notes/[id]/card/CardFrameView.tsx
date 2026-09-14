"use client";

import { useMemo } from "react";
import type { CardTheme } from "@/lib/notes/card-themes";
import { CARD_BRAND_DOMAIN, type FrameContent } from "@/lib/notes/card-frames";
import { encodeQr } from "@/lib/qr/encode";
import { qrSvgProps } from "@/lib/qr/svg";

/**
 * 카드 한 장(프레임) HTML 렌더 — 테마 색을 인라인 스타일로 그린다(테마 hex 는
 * 동적이라 Tailwind 클래스로 못 박는다). satori 이미지가 아니라 화면·미리보기용.
 * 세로 4:5 비율. 모든 장이 같은 테마 배경을 공유해 캐러셀이 한 벌로 읽힌다.
 */

const TONE_DOT: Record<"good" | "mid" | "bad", string> = {
  good: "#22c55e",
  mid: "#eab308",
  bad: "#ef4444",
};

/* [997] 마무리 장 QR 한 변(px) — 미리보기 320px 기준. 내보내기는 1080px 로 균일 확대되므로
   54 × 3.375 ≈ 182px, 모듈(v3 29칸 + 여백 3칸) 하나가 5px 남짓 — 카톡에서 받은 PNG 를
   다른 폰으로 찍어도 읽힌다. 항상 흰 바탕·짙은 모듈(테마 무관) — 판독기는 대비만 본다. */
const QR_PX = 54;

export function CardFrameView({
  content,
  theme,
  index,
  total,
  footer = CARD_BRAND_DOMAIN,
}: {
  content: FrameContent;
  theme: CardTheme;
  index?: number;
  total?: number;
  /** [995] 하단 브랜드 라인 — 기본은 도메인, 스튜디오는 짧은 링크(`naezipnow.com/n/…`)를 넘긴다 */
  footer?: string;
}) {
  return (
    <div
      className="relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-[18px] p-6"
      style={{ background: theme.bg, color: theme.ink }}
    >
      {/* 상단 브랜드 표식 + 페이지 인디케이터 */}
      <div className="flex items-center justify-between">
        <span className="t-sub font-extrabold tracking-tight" style={{ color: theme.accent }}>
          내집나우 임장노트
        </span>
        {typeof index === "number" && typeof total === "number" && (
          <span className="t-caption font-bold" style={{ color: theme.sub }}>
            {index + 1} / {total}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center py-3">
        <FrameBody content={content} theme={theme} />
      </div>

      {/* 마무리 장이 아니면 하단에 얇은 브랜드 라인 — [995] 짧은 링크가 매 장에 찍힌다
          (한 장만 따로 공유돼도 돌아올 길이 남는다). 크기·자리는 그대로.
          [997] 마무리 장은 그 자리에 QR(공개 노트만) — 글자 링크 바로 아래, 우하단. */}
      {content.kind === "cta" ? (
        content.qrUrl ? <CtaQr url={content.qrUrl} theme={theme} /> : null
      ) : (
        <div className="t-caption font-semibold" style={{ color: theme.sub }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/* [997] 마무리 장 우하단 QR — 인라인 <svg>(path 하나)라 html-to-image 가 그대로 굽는다.
   왼쪽 캡션은 "찍으면 열린다"만 — 주소 글자는 바로 위 알약(content.sub)에 이미 있다. */
function CtaQr({ url, theme }: { url: string; theme: CardTheme }) {
  const qr = useMemo(() => {
    try {
      return qrSvgProps(encodeQr(url).modules, { quietZone: 3 });
    } catch {
      return null; // 짧은 링크(≈32자)는 v3 — 넘칠 일이 없지만 카드가 죽지는 않게
    }
  }, [url]);
  if (!qr) return null;
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col t-caption font-semibold leading-snug" style={{ color: theme.sub }}>
        <span>카메라로 QR을 찍으면</span>
        <span>이 노트로 바로 열려요</span>
      </div>
      <svg
        role="img"
        aria-label={`QR — ${url}`}
        viewBox={qr.viewBox}
        width={QR_PX}
        height={QR_PX}
        shapeRendering="crispEdges"
        className="shrink-0 rounded-[6px]"
      >
        <rect width="100%" height="100%" fill={qr.bg} />
        <path d={qr.path} fill={qr.fg} />
      </svg>
    </div>
  );
}

function FrameBody({ content, theme }: { content: FrameContent; theme: CardTheme }) {
  switch (content.kind) {
    case "cover":
      return (
        <div className="flex flex-col gap-2">
          {content.region && (
            <span className="t-sub font-bold" style={{ color: theme.sub }}>
              {content.region}
              {content.visit ? ` · ${content.visit}` : ""}
            </span>
          )}
          <span className="t-title leading-tight" style={{ color: theme.ink }}>
            {content.apt}
          </span>
          {content.verdict && (
            <span className="mt-1 t-body font-semibold leading-snug" style={{ color: theme.accent }}>
              “{content.verdict}”
            </span>
          )}
        </div>
      );

    case "scoreRing":
      return (
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-[128px] w-[128px] flex-col items-center justify-center rounded-full"
            style={{ border: `8px solid ${theme.accent}`, background: theme.panel }}
          >
            <span className="t-title leading-none" style={{ color: theme.accent }}>
              {content.score}
            </span>
            <span className="t-sub font-bold" style={{ color: theme.sub }}>
              / 100
            </span>
          </div>
          <span className="t-section" style={{ color: theme.ink }}>
            {content.grade}
          </span>
        </div>
      );

    case "scoreBars":
      return (
        <div className="flex flex-col gap-2.5">
          <span className="mb-1 t-body font-extrabold" style={{ color: theme.ink }}>
            항목별 점수
          </span>
          {content.bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 t-sub font-bold" style={{ color: theme.sub }}>
                {b.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: theme.panel }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(4, Math.min(100, b.value))}%`, background: theme.accent }}
                />
              </div>
              <span className="w-7 shrink-0 text-right t-sub font-extrabold" style={{ color: theme.ink }}>
                {b.value}
              </span>
            </div>
          ))}
        </div>
      );

    case "summary":
      return (
        <div className="flex flex-col gap-2">
          <span className="t-body font-extrabold" style={{ color: theme.accent }}>
            {content.heading}
          </span>
          <span className="t-body font-bold" style={{ color: theme.ink }}>
            {content.body}
          </span>
        </div>
      );

    case "checklist":
      return (
        <div className="flex flex-col gap-2">
          <span className="mb-1 t-body font-extrabold" style={{ color: theme.ink }}>
            현장 체크
          </span>
          {content.items.map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-start gap-2 t-body font-semibold leading-snug" style={{ color: theme.ink }}>
                <span
                  className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: it.rating ? TONE_DOT[it.tone] : theme.accent }}
                />
                <span className="min-w-0">{it.label}</span>
              </span>
              {it.rating && (
                <span className="shrink-0 t-sub font-bold" style={{ color: theme.sub }}>
                  {it.rating}
                </span>
              )}
            </div>
          ))}
        </div>
      );

    case "list":
      return (
        <div className="flex flex-col gap-2">
          <span
            className="t-body font-extrabold"
            style={{ color: content.tone === "pos" ? theme.accent : "#f87171" }}
          >
            {content.heading}
          </span>
          <div className="flex flex-col gap-1.5">
            {content.items.map((it, i) => (
              <span key={i} className="t-body font-semibold leading-snug" style={{ color: theme.ink }}>
                {content.tone === "pos" ? "▲ " : "▽ "}
                {it}
              </span>
            ))}
          </div>
        </div>
      );

    case "context":
      return (
        <div className="flex flex-col gap-3">
          {content.rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5">
              <span className="t-sub font-bold" style={{ color: theme.sub }}>
                {r.label}
              </span>
              <span className="t-section" style={{ color: theme.ink }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      );

    case "tags":
      return (
        <div className="flex flex-col gap-3">
          <span className="t-body font-extrabold" style={{ color: theme.ink }}>
            {content.heading}
          </span>
          <div className="flex flex-wrap gap-2">
            {content.tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-3 py-1.5 t-body font-bold"
                style={{ background: theme.chipBg, color: theme.chipInk }}
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      );

    /* [988] 노트 밖의 숫자 — 실거래·전세가율처럼 현장에서 볼 수 없는 값.
       출처를 카드 안에 함께 찍는다: 공유되는 이미지는 되돌릴 수 없어서,
       숫자만 남고 근거가 빠지면 그때부터 그 카드가 곧 주장이 된다. */
    case "market":
      return (
        <div className="flex flex-col gap-3">
          <span className="t-body font-extrabold" style={{ color: theme.ink }}>
            {content.heading}
          </span>
          <div className="flex flex-col gap-2">
            {content.rows.map((r) => (
              <div
                key={r.label}
                className="flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5"
                style={{ background: theme.panel }}
              >
                <span className="t-sub font-bold" style={{ color: theme.sub }}>
                  {r.label}
                </span>
                <span className="flex flex-col items-end">
                  <span className="t-section t-num" style={{ color: theme.accent }}>
                    {r.value}
                  </span>
                  {r.note ? (
                    <span className="t-caption" style={{ color: theme.sub }}>
                      {r.note}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          {content.source ? (
            <span className="t-caption" style={{ color: theme.sub }}>
              출처 · {content.source}
            </span>
          ) : null}
        </div>
      );

    case "cta":
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="t-section leading-snug" style={{ color: theme.ink }}>
            {content.heading}
          </span>
          <span
            className="rounded-full px-4 py-1.5 t-body font-extrabold"
            style={{ background: theme.chipBg, color: theme.chipInk }}
          >
            {content.sub}
          </span>
        </div>
      );
  }
}
