"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CardFrameView } from "./CardFrameView";
import { KAKAO_JS_KEY, loadKakaoSdk } from "./kakao-sdk";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import { useCopy } from "@/lib/ui/use-copy";
import { trackPlatformEvent } from "@/lib/platform-events-client";
import { buildKakaoFeedShare } from "@/lib/kakao/share-template";
import { CARD_THEMES, getCardTheme } from "@/lib/notes/card-themes";
import { MIN_FRAMES, MAX_FRAMES } from "@/lib/notes/card-config";
import { CARD_PRESETS, CARD_IMAGE_SIZE } from "@/lib/notes/card-presets";
import type { FrameContent } from "@/lib/notes/card-frames";

/* [995] 퍼널 이벤트명 — lib/platform-funnel-events 의 CARD_SHARE·CARD_EXPORT 와 같은 값.
   그 파일은 서버 모듈을 끌어와 클라이언트에서 못 읽는다(LoginClient 와 같은 관례). */
const EV_CARD_SHARE = "card_share";
const EV_CARD_EXPORT = "card_export";
type ShareChannel = "files" | "kakao" | "copy" | "download";

/**
 * 나만의 카드 스튜디오 — 테마 10종 선택 + 프레임(장) 선택(최소 5, 표지 고정) +
 * 라이브 미리보기 캐러셀 + 저장. 소유자만 편집, 비소유자는 캐러셀만.
 *
 * 서버가 넘겨준 것: 이 노트에서 채울 수 있는 프레임들의 완성 콘텐츠(available)와
 * 저장된/자동 구성. 클라이언트는 토글·순서·테마만 다루고 콘텐츠는 서버 build()
 * 결과를 그대로 쓴다(콘텐츠 로직 이원화 방지).
 */

export type AvailableFrame = {
  id: string;
  label: string;
  category: string;
  content: FrameContent;
};

export function NoteCardStudio({
  noteId,
  available,
  initialThemeId,
  initialFrameIds,
  editable,
  shareable,
  shareUrl,
  shareLabel,
  shareTitle,
  shareText,
  kakaoImageUrl,
}: {
  noteId: string;
  available: AvailableFrame[];
  initialThemeId: string;
  initialFrameIds: string[];
  editable: boolean;
  /** [995] 공개 노트만 링크로 나간다 — 비공개는 받은 사람이 못 여니 공유 줄 대신 안내만 */
  shareable: boolean;
  /** 절대 짧은 링크 `https://naezipnow.com/n/xxxxxxxx` — 복사·시트·카카오가 쓴다 */
  shareUrl: string;
  /** 카드에 인쇄되는 표기 `naezipnow.com/n/xxxxxxxx` */
  shareLabel: string;
  /** 공유 시트·카카오 제목(노트 제목) */
  shareTitle: string;
  /** 한 줄 설명(판정·점수) */
  shareText: string;
  /** 카카오 피드 썸네일 — 노트 상세가 쓰는 /api/og/note 절대 주소. 없으면 SDK 기본 */
  kakaoImageUrl: string | null;
}) {
  const byId = useMemo(() => new Map(available.map((f) => [f.id, f])), [available]);
  const { showToast } = useToast();
  /* [1009 · T] 복사 토스트 문구 통일 — "링크를 복사했어요"(사이트 공통 · 390px 한 줄) */
  const { copy, copied } = useCopy("링크를 복사했어요");
  const [themeId, setThemeId] = useState(initialThemeId);
  // 표지는 항상 첫 장 고정. 선택 순서 = 장 순서.
  const [selected, setSelected] = useState<string[]>(() => {
    const s = initialFrameIds.filter((id) => byId.has(id));
    return s[0] === "cover" ? s : ["cover", ...s.filter((x) => x !== "cover")];
  });
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const theme = getCardTheme(themeId);
  const frames = selected.map((id) => byId.get(id)).filter((f): f is AvailableFrame => Boolean(f));
  const activeFrame = frames[Math.min(active, frames.length - 1)];

  function toggle(id: string) {
    if (id === "cover") return; // 표지 고정
    setSelected((cur) => {
      if (cur.includes(id)) {
        if (cur.length <= MIN_FRAMES) {
          setMsg(`최소 ${MIN_FRAMES}장이 필요해요`);
          return cur;
        }
        setMsg(null);
        return cur.filter((x) => x !== id);
      }
      if (cur.length >= MAX_FRAMES) {
        setMsg(`최대 ${MAX_FRAMES}장까지 담을 수 있어요`);
        return cur;
      }
      setMsg(null);
      return [...cur, id];
    });
  }

  /* [988] 이미지로 내려받기 — 스튜디오에 **내보내기가 아예 없었다**.
     화면으로 보고 끝나면 카드를 만들 이유가 없다(실제 생성 0건).

     서버에서 PNG 를 그리는 방법(next/og)도 있지만, 그러면 장 13종의 레이아웃을
     satori 용으로 한 벌 더 구현해야 하고 두 구현이 반드시 어긋난다. 지금 보고 있는
     DOM 을 그대로 굽는 쪽이 "미리보기 = 결과물" 을 보장한다.
     라이브러리는 **누를 때** 받는다(동적 import) — 안 쓰는 사람의 첫 화면에 얹지 않는다. */
  const shotRef = useRef<HTMLDivElement | null>(null);
  const [shooting, setShooting] = useState(false);

  /* 지금 보고 있는 장을 1080px PNG 로 굽는다 — 저장·공유 시트가 같은 결과물을 쓴다 */
  const renderPng = useCallback(async (): Promise<Blob> => {
    const el = shotRef.current;
    if (!el) throw new Error("no frame");
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(el, {
      /* 미리보기는 320px 폭이다. 공유용은 1080px 이라야 카톡에서 안 뭉갠다. */
      pixelRatio: CARD_IMAGE_SIZE.width / (el.offsetWidth || CARD_IMAGE_SIZE.width),
      cacheBust: true,
    });
    if (!blob) throw new Error("이미지를 만들지 못했어요");
    return blob;
  }, []);

  const fileName = `임장노트-${activeFrame?.label ?? "카드"}-${active + 1}.png`;

  const saveBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* 브라우저가 저장을 시작한 뒤에 풀어 준다 — 바로 풀면 빈 파일이 떨어진다 */
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    [fileName],
  );

  /* [995] 공유·저장 이벤트 — 카드가 실제로 밖으로 나가는지 어드민 트래픽 "기능 사용"에 남긴다.
     노트 id 는 uuid 라 개인정보가 아니다. 이메일은 서버가 세션에서 붙인다. */
  const track = useCallback(
    (eventName: string, extra: Record<string, unknown>) => {
      trackPlatformEvent({
        eventName,
        source: "note_card",
        campaign: "funnel",
        metadata: { noteId, frame: activeFrame?.id ?? null, theme: themeId, ...extra },
      });
    },
    [noteId, activeFrame, themeId],
  );

  const download = useCallback(async () => {
    if (!shotRef.current || shooting) return;
    setShooting(true);
    setMsg(null);
    try {
      saveBlob(await renderPng());
      track(EV_CARD_EXPORT, {});
      showToast("이미지를 내려받았어요");
    } catch {
      showToast("이미지를 만들지 못했어요 — 다시 눌러 주세요");
    } finally {
      setShooting(false);
    }
  }, [shooting, renderPng, saveBlob, track, showToast]);

  /* [995] "이미지로 공유" — 카톡·인스타로 바로 보내는 길. 지금까지는 저장 → 갤러리 → 앱
     세 단계였고, 그 사이에 대부분이 떨어진다. 파일 공유 시트(iOS·안드로이드)가 되면
     그걸 띄우고, 안 되는 브라우저(데스크톱 대부분)는 예전처럼 내려받는다. 링크는
     본문(text)에 싣는다 — 파일과 url 을 같이 넣으면 거부하는 시트가 있다. */
  const shareImage = useCallback(async () => {
    if (!shotRef.current || shooting) return;
    setShooting(true);
    try {
      const blob = await renderPng();
      const file = new File([blob], "임장노트-카드.png", { type: "image/png" });
      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canShareFiles) {
        try {
          await navigator.share({
            files: [file],
            title: shareTitle,
            text: `${shareText}\n${shareUrl}`,
          });
          track(EV_CARD_SHARE, { channel: "files" satisfies ShareChannel });
          return;
        } catch (e) {
          /* 시트를 닫은 것은 취소 — 내려받기로 대체하지 않는다 */
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      saveBlob(blob);
      track(EV_CARD_SHARE, { channel: "download" satisfies ShareChannel });
      showToast("이미지를 내려받았어요");
    } catch {
      showToast("이미지를 만들지 못했어요 — 다시 눌러 주세요");
    } finally {
      setShooting(false);
    }
  }, [shooting, renderPng, saveBlob, track, showToast, shareTitle, shareText, shareUrl]);

  const copyLink = useCallback(async () => {
    if (await copy(shareUrl)) track(EV_CARD_SHARE, { channel: "copy" satisfies ShareChannel });
  }, [copy, shareUrl, track]);

  /* 카카오톡 — JS 키가 있는 배포에서만 버튼이 그려진다. SDK 는 누를 때 받는다. */
  const shareKakao = useCallback(async () => {
    const kakao = await loadKakaoSdk();
    if (!kakao?.Share?.sendDefault) {
      showToast("카카오톡을 열지 못했어요 — 링크 복사로 보내 주세요");
      return;
    }
    try {
      kakao.Share.sendDefault(
        buildKakaoFeedShare({
          title: shareTitle,
          description: shareText,
          shareUrl,
          imageUrl: kakaoImageUrl ?? undefined,
          buttonTitle: "임장노트 보기",
        }),
      );
      track(EV_CARD_SHARE, { channel: "kakao" satisfies ShareChannel });
    } catch {
      showToast("카카오톡을 열지 못했어요 — 링크 복사로 보내 주세요");
    }
  }, [showToast, shareTitle, shareText, shareUrl, kakaoImageUrl, track]);

  async function save() {
    setSaving(true);
    setSaved("idle");
    try {
      const res = await fetch(`/api/notes/${noteId}/card-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, frameIds: selected }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        config?: { themeId: string; frameIds: string[] };
        error?: string;
      };
      if (res.ok && j.ok && j.config) {
        setSelected(j.config.frameIds.filter((id) => byId.has(id)));
        setThemeId(j.config.themeId);
        setSaved("ok");
        setMsg("카드를 저장했어요");
      } else {
        setSaved("err");
        setMsg(j.error ?? "저장에 실패했어요");
      }
    } catch {
      setSaved("err");
      setMsg("네트워크 오류로 저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      {/* 미리보기 캐러셀 */}
      <div className="mx-auto w-full max-w-[320px] shrink-0 md:mx-0">
        {activeFrame ? (
          <div ref={shotRef}>
            <CardFrameView
              content={activeFrame.content}
              theme={theme}
              index={active}
              total={frames.length}
              footer={shareLabel}
            />
          </div>
        ) : (
          <div className="aspect-[4/5] w-full rounded-[18px] bg-[rgba(0,0,0,.05)]" />
        )}
        {/* 장 네비게이션 (점) */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {frames.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${i + 1}번째 장 (${f.label})`}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-5 bg-primary" : "w-2 bg-[rgba(0,0,0,.18)]"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-center t-sub text-text-3">
          {frames.length}장 · {activeFrame?.label ?? ""}
        </p>
        <button
          type="button"
          onClick={download}
          disabled={shooting || !activeFrame}
          className="btn-primary press mt-2.5 min-h-10 w-full rounded-[10px] px-4 py-2.5 t-body font-bold disabled:opacity-60"
        >
          {shooting ? "이미지 만드는 중…" : "이 장 이미지로 저장"}
        </button>
        <p className="mt-1.5 text-center t-caption text-text-3">
          {CARD_IMAGE_SIZE.width}×{CARD_IMAGE_SIZE.height} PNG · 카카오톡·인스타에서 안 잘리는 비율
        </p>

        {/* [995] 공유 줄 — 소유자·열람자 모두. 카드 이미지는 링크가 안 눌리므로 장마다
            naezipnow.com/n/코드 를 인쇄해 두고, 여기서는 그 링크를 손에 쥐여 준다. */}
        {shareable ? (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void shareImage()}
                disabled={shooting || !activeFrame}
                className="btn-soft press flex min-h-10 min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 t-body font-bold disabled:opacity-60"
              >
                <Icon name="share" size={14} />
                이미지로 공유
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="btn-soft press flex min-h-10 min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 t-body font-bold"
              >
                <Icon name="link" size={14} />
                {copied ? "복사됨 ✓" : "링크 복사"}
              </button>
              {/* 카카오 브랜드 색·이름은 **정말 카카오로 보낼 때만** — 키 없는 배포엔 버튼이 없다 */}
              {KAKAO_JS_KEY && (
                <button
                  type="button"
                  onClick={() => void shareKakao()}
                  className="press flex min-h-10 min-w-[120px] flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#FEE500] px-3 py-2 t-body font-bold text-[#191600]"
                >
                  <Icon name="messages-square" size={14} />
                  카카오톡
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center t-sub text-text-3">
              카드에 찍힌 <span className="font-bold text-text-2">{shareLabel}</span> 로 이 노트에
              돌아와요
            </p>
          </div>
        ) : (
          <p className="mt-3 text-center t-sub text-text-3">
            비공개 노트예요 — 공개로 전환하면 링크·이미지로 공유할 수 있어요
          </p>
        )}
      </div>

      {editable ? (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* [988] 완성본 3벌 — 소유자 지시("2~3가지 버전으로 제공하는 디자인 양식").
              지금까지는 테마 10종 × 장 13종을 직접 조합하는 빌더뿐이었다. 조합이
              130가지라 고르는 것 자체가 일이고, 실제로 만들어진 카드는 0건이었다.
              고르면 끝나는 벌을 먼저 두고, 빌더는 아래에 그대로 남긴다. */}
          <div>
            <div className="mb-1 t-sub font-extrabold text-ink">완성된 카드 고르기</div>
            <p className="mb-2 t-caption text-text-3">
              누르면 색과 장 구성이 한 번에 잡혀요. 아래에서 계속 손볼 수 있어요.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CARD_PRESETS.map((p) => {
                const usable = p.frameIds.filter((id) => byId.has(id));
                const on = themeId === p.themeId && selected.join(",") === usable.join(",");
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setThemeId(p.themeId);
                      setSelected(usable);
                      setActive(0);
                      setMsg(
                        usable.length < p.frameIds.length
                          ? `${p.label} 적용 — 재료가 없는 장 ${p.frameIds.length - usable.length}개는 빠졌어요`
                          : `${p.label} 적용`,
                      );
                    }}
                    aria-pressed={on}
                    className={`press flex flex-col gap-0.5 rounded-[12px] border px-3 py-2.5 text-left ${
                      on ? "border-primary bg-primary-soft" : "border-line bg-surface"
                    }`}
                  >
                    <span className="t-body font-extrabold text-ink">{p.label}</span>
                    <span className="t-caption leading-[1.5] text-text-2">{p.premise}</span>
                    <span className="t-caption text-text-3">
                      {usable.length}장
                      {p.withMarket ? " · 실거래 숫자 포함" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 테마 10종 */}
          <div>
            <div className="mb-2 t-sub font-extrabold text-ink">카드 색상 테마</div>
            <div className="flex flex-wrap gap-2">
              {CARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThemeId(t.id)}
                  aria-pressed={themeId === t.id}
                  className={`press flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-bold transition-all ${
                    themeId === t.id ? "border-primary ring-2 ring-primary/30" : "border-line"
                  }`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-black/10"
                    style={{ background: t.bg }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 프레임(장) 선택 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="t-sub font-extrabold text-ink">
                카드에 담을 장 (최소 {MIN_FRAMES}장)
              </span>
              <span className="t-sub text-text-3">{selected.length}장 선택</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {available.map((f) => {
                const on = selected.includes(f.id);
                const locked = f.id === "cover";
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggle(f.id)}
                    disabled={locked}
                    className={`flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-left text-[12px] font-bold transition-all ${
                      on
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-line bg-surface text-text-2"
                    } ${locked ? "opacity-70" : ""}`}
                  >
                    <span className="t-body">{on ? "✓" : "+"}</span>
                    <span className="min-w-0 truncate">{f.label}</span>
                    {locked && <span className="ml-auto t-caption text-text-3">고정</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary btn-sm rounded-[10px] px-4 py-2 t-body font-bold disabled:opacity-60"
            >
              {saving ? "저장 중…" : "카드 저장"}
            </button>
            {msg && (
              <span className={`text-[12px] font-bold ${saved === "err" ? "text-danger" : "text-text-2"}`}>
                {msg}
              </span>
            )}
          </div>
          <p className="t-sub text-text-3">
            표지는 항상 첫 장이에요. 담은 장의 내용은 임장노트에서 기록한 값으로 자동으로 채워지고,
            데이터가 없는 장은 목록에 나오지 않아요.
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="t-body text-text-2">
            작성자가 만든 {frames.length}장짜리 임장 카드예요. 점을 눌러 넘겨 보세요.
          </p>
        </div>
      )}
    </div>
  );
}
