"use client";
/* [1026b · 노트 쓰기] 비회원 — 녹음 버튼 자리에 로그인 링크(callbackUrl = 지금 주소, 녹음 전에 말한다). 로그인 여부를 몰랐다가
   업로드가 401 이면 "저장에 실패했어요" 가 아니라 같은 로그인 안내로 바꾼다(녹음 뒤 실패로 알리지 않는다). */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/* [#133] 음성 메모 — 현장 30초 녹음. MediaRecorder → /api/upload(audio/webm).
   저장·재생 + [945 #16] 전사(글로 옮기기): /api/ai/transcribe 가 텍스트를
   돌려주면 onTranscript 로 메모란에 붙인다. 최대 3개·개당 60초.
   권한 거부·미지원은 배지로 말하고 조용히 접힌다(폼 저장은 영향 없음). */

const MAX_MEMOS = 3;
const MAX_SEC = 60;

export function VoiceMemoRecorder({
  memos,
  onChange,
  onTranscript,
  guest = false,
}: {
  memos: string[];
  onChange: (urls: string[]) => void;
  /** 전사 결과를 받을 곳(메모란 append) — 없으면 전사 버튼을 그리지 않는다 */
  onTranscript?: (text: string) => void;
  /** [1026b] 비회원 확정(NoteForm isGuest === true) — 녹음 대신 로그인 링크 */
  guest?: boolean;
}) {
  /* url → 전사 상태. done 은 같은 녹음의 중복 전사(중복 비용)를 막는다 */
  const [txState, setTxState] = useState<Record<string, "busy" | "done" | "error" | "unavailable">>({});

  async function transcribe(url: string) {
    if (!onTranscript || txState[url] === "busy" || txState[url] === "done") return;
    setTxState((s) => ({ ...s, [url]: "busy" }));
    try {
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        text?: string;
      };
      if (json.ok && json.text) {
        onTranscript(json.text);
        setTxState((s) => ({ ...s, [url]: "done" }));
      } else if (json.reason === "unavailable") {
        setTxState((s) => ({ ...s, [url]: "unavailable" }));
      } else {
        setTxState((s) => ({ ...s, [url]: "error" }));
      }
    } catch {
      setTxState((s) => ({ ...s, [url]: "error" }));
    }
  }
  const [state, setState] = useState<
    "idle" | "recording" | "uploading" | "unsupported" | "denied" | "error" | "login"
  >("idle");
  /* [1026b] 로그인 뒤 돌아올 곳 = 지금 주소(쿼리 포함). ssr:false 조각이라 첫 렌더가 곧 브라우저다 */
  const loginHref = `/login?callbackUrl=${encodeURIComponent(
    typeof window === "undefined" ? "/notes/new" : window.location.pathname + window.location.search,
  )}`;
  const needLogin = guest || state === "login";
  const [sec, setSec] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = () => {
    recRef.current?.stop();
  };

  const start = async () => {
    if (memos.length >= MAX_MEMOS) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setSec(0);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1000) {
          setState("idle");
          return;
        }
        setState("uploading");
        try {
          const fd = new FormData();
          fd.append(
            "file",
            new File([blob], `voice-${Date.now()}.${mime === "audio/webm" ? "webm" : "m4a"}`, {
              type: mime,
            }),
          );
          fd.append("folder", "notes-voice");
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          const json: { url?: string } = await res.json().catch(() => ({}));
          if (res.ok && json.url) {
            onChange([...memos, String(json.url)].slice(0, MAX_MEMOS));
            setState("idle");
          } else {
            /* [1026b] 401 = 비회원 — 실패가 아니라 로그인 안내 */
            setState(res.status === 401 ? "login" : "error");
          }
        } catch {
          setState("error");
        }
      };
      rec.start();
      recRef.current = rec;
      setState("recording");
      setSec(0);
      timerRef.current = window.setInterval(() => {
        setSec((s) => {
          if (s + 1 >= MAX_SEC) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setState("denied");
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="t-body font-bold text-ink">
          음성 메모 <span className="font-medium text-text-3">(선택 · 최대 {MAX_MEMOS}개)</span>
        </span>
        {needLogin && state !== "recording" ? (
          <Link
            href={loginHref}
            className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg border border-line-strong bg-bg px-3 py-1.5 t-sub font-bold text-primary"
          >
            로그인 ›
          </Link>
        ) : state === "recording" ? (
          <button
            type="button"
            onClick={stop}
            /* [984] 실측 32px — 현장에서 장갑 낀 손으로도 누르는 버튼이다(989 기준 40px) */
            className="min-h-[40px] rounded-lg bg-danger px-3 py-1.5 t-sub font-bold text-white"
          >
            ■ 녹음 끝내기 {sec}s
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={state === "uploading" || memos.length >= MAX_MEMOS}
            className="min-h-[40px] rounded-lg border border-line-strong bg-bg px-3 py-1.5 t-sub font-bold text-text-1 disabled:opacity-50"
          >
            {state === "uploading" ? "저장 중…" : (<><Icon name="mic" size={14} className="mr-1 inline align-[-2px]" />30초 녹음</>)}
          </button>
        )}
      </div>
      {memos.length > 0 && (
        <div className="flex flex-col gap-1">
          {memos.map((u, i) => (
            <div key={u} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio src={u} controls preload="none" className="h-8 w-full" />
                {onTranscript && (
                  <button
                    type="button"
                    onClick={() => void transcribe(u)}
                    disabled={txState[u] === "busy" || txState[u] === "done"}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 t-caption font-bold text-text-1 disabled:opacity-60"
                  >
                    {txState[u] === "busy"
                      ? "옮기는 중…"
                      : txState[u] === "done"
                        ? "✓ 옮김"
                        : "✍ 글로"}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`음성 메모 ${i + 1} 삭제`}
                  onClick={() => onChange(memos.filter((m) => m !== u))}
                  className="shrink-0 t-sub font-bold text-text-3"
                >
                  ✕
                </button>
              </div>
              {txState[u] === "error" && (
                <p className="t-caption font-semibold text-warning">
                  전사에 실패했어요. 잠시 후 다시 시도해 주세요.
                </p>
              )}
              {txState[u] === "unavailable" && (
                <p className="t-caption text-text-3">지금은 전사를 지원하지 않아요.</p>
              )}
            </div>
          ))}
        </div>
      )}
      {state === "denied" && (
        <p className="t-sub font-bold text-text-3">마이크 권한이 거부돼 녹음을 건너뛰어요.</p>
      )}
      {state === "unsupported" && (
        <p className="t-sub font-bold text-text-3">이 브라우저는 녹음을 지원하지 않아요.</p>
      )}
      {state === "error" && (
        <p className="t-sub font-bold text-warning">저장에 실패했어요. 다시 시도해 주세요.</p>
      )}
      {needLogin && <p className="t-sub text-text-2">음성 메모는 로그인 후 녹음</p>}
      {/* [1015 · 규칙 B] 권유 문장은 뺐다 — 공개 범위 사실만 */}
      <p className="t-caption text-text-3">녹음은 노트에 첨부 · 공개 노트에서는 다른 사람도 들을 수 있음</p>
    </div>
  );
}
