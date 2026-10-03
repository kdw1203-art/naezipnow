"use client";

/* "썸네일 고르기" — 후보 3장(정사각) 중 하나를 골라 저장한다. 이 라우트에만 있는 클라이언트 코드라
   /notes/new 번들에는 실리지 않는다. 문구·검증·그림은 전부 서버(API)가 만들고 여기서는 고르고 보내기만 한다.

   v4 — 제목 한 줄(페이지) · 주인공 = 고른 썸네일 큰 미리보기 · 채움 파랑 1개("이 썸네일로 올리기") ·
   글자 링크 1개("나중에 고르기"). 선택 = 한지 면 + 남색 2px 테두리(필터 칩과 같은 선택 표기). */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type CoverCandidate = {
  variant: "navy" | "hanji" | "photo" | "light";
  headline: string;
  fact: string | null;
  sub: string;
  source: "ai" | "rule";
  previewUrl: string;
};

export function CoverPicker({
  noteId,
  fallback,
  doneHref,
}: {
  noteId: string;
  /** 서버가 미리 만든 규칙 후보 3장 — 후보 API 가 실패해도 고를 수 있게 */
  fallback: CoverCandidate[];
  /** 저장·나중에 고르기 뒤 갈 곳(노트 상세) */
  doneHref: string;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  /* 후보 요청은 화면당 한 번 — 개발 모드의 이중 마운트에서도 LLM 을 두 번 부르지 않게 ref 로 막는다
     (중단(abort)하지 않는다: 첫 마운트의 요청을 끊으면 두 번째 마운트가 다시 보내지 않아 후보가 비어 버린다) */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(`/api/notes/${encodeURIComponent(noteId)}/cover/suggest`, { method: "POST" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { candidates?: CoverCandidate[] } | null;
        const got = res.ok && Array.isArray(json?.candidates) ? json.candidates : [];
        setCandidates(got.length ? got : fallback);
      })
      .catch(() => setCandidates(fallback));
  }, [noteId, fallback]);

  const list = candidates ?? [];
  const current = list[selected] ?? null;

  const save = async () => {
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: current.variant,
          headline: current.headline,
          fact: current.fact,
          source: current.source,
        }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "로그인이 끊겼어요. 다시 로그인이 필요해요" : "저장하지 못했어요. 다시 시도해 주세요");
        setSaving(false);
        return;
      }
      router.push(doneHref);
      router.refresh();
    } catch {
      setError("연결이 끊겼어요. 다시 시도해 주세요");
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-4">
      {/* 주인공 — 고른 썸네일 큰 미리보기 */}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-divider" aria-busy={!current}>
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.previewUrl}
            alt={`${current.headline} 썸네일 미리보기`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <p className="t-caption text-text-3" aria-live="polite">
        {!current ? "노트에서 문구를 뽑는 중" : current.source === "ai" ? "AI가 노트에서 뽑은 문구" : "노트에서 뽑은 문구"}
      </p>

      <div role="group" aria-label="썸네일 후보" className="grid grid-cols-3 gap-2">
        {current
          ? list.map((c, i) => (
              <button
                key={`${c.variant}-${i}`}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={i === selected}
                aria-label={`후보 ${i + 1}: ${c.headline}${c.fact ? ` · ${c.fact}` : ""}`}
                className={`press rounded-lg border-2 p-1 ${
                  i === selected ? "border-brand-hanji-ink bg-brand-hanji" : "border-transparent"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.previewUrl} alt="" loading="lazy" className="block aspect-square w-full rounded-sm object-cover" />
              </button>
            ))
          : [0, 1, 2].map((i) => (
              <span key={i} className="block rounded-lg border-2 border-transparent p-1">
                <span className="block aspect-square w-full rounded-sm bg-divider" />
              </span>
            ))}
      </div>

      {error && (
        <p role="alert" className="t-sub text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!current || saving}
        className={`btn-primary btn-lg w-full ${saving ? "is-busy" : ""}`}
      >
        {saving ? "올리는 중" : "이 썸네일로 올리기"}
      </button>
      <Link href={doneHref} className="self-start t-body text-text-2 underline underline-offset-4">
        나중에 고르기
      </Link>
    </div>
  );
}
