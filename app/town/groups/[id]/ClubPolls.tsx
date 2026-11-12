"use client";
/* [1168] 모임 투표 — 텍스트 · 날짜, 복수 선택, 결과 막대. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/IntentLink";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { pollOptionLabel } from "@/lib/groups/club";
import type { PollView } from "@/lib/groups/club-types";
import { clubPost, FIELD } from "./club-post";

export function ClubPolls({
  groupId,
  polls,
  canWrite,
  isOrganizer,
  minDate,
}: {
  groupId: string;
  polls: PollView[];
  canWrite: boolean;
  isOrganizer: boolean;
  minDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const err = await clubPost(groupId, body);
    setBusy(null);
    if (err) setError(err);
    else router.refresh();
  }

  function toggle(p: PollView, optionId: string) {
    const cur = draft[p.id] ?? p.myVote;
    const next = p.multiple
      ? cur.includes(optionId)
        ? cur.filter((x) => x !== optionId)
        : [...cur, optionId]
      : [optionId];
    setDraft((d) => ({ ...d, [p.id]: next }));
  }

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary rounded-xl p-3.5 t-body font-bold">
          투표 만들기
        </button>
      )}
      {error && <div className="t-sub font-semibold text-danger">{error}</div>}

      {polls.length === 0 ? (
        <div className="card p-5 text-center t-body text-text-3">투표 없음</div>
      ) : (
        polls.map((p) => {
          const picked = draft[p.id] ?? p.myVote;
          const changed = picked.length > 0 && picked.slice().sort().join() !== p.myVote.slice().sort().join();
          return (
            <section key={p.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="t-body font-bold leading-[1.4] text-ink">{p.title}</h3>
                  <div className="t-caption text-text-3">
                    {[p.authorLabel, `${p.voters}명 참여`, p.multiple ? "복수 선택" : null, p.closed ? "마감" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {!p.closed && canWrite && (p.mine || isOrganizer) && (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => void act({ action: "poll.close", pollId: p.id }, p.id)}
                    className="btn-ghost min-h-[40px] shrink-0 rounded-lg px-2 t-caption text-text-3 disabled:opacity-60"
                  >
                    마감
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {p.options.map((o) => {
                  const pct = p.voters > 0 ? Math.round((o.count / p.voters) * 100) : 0;
                  const on = picked.includes(o.id);
                  const top = p.topIds.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={p.closed || !canWrite}
                      aria-pressed={on}
                      onClick={() => toggle(p, o.id)}
                      className={`relative min-h-[44px] overflow-hidden rounded-xl border px-3 text-left ${
                        on ? "border-primary" : "border-line"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute inset-y-0 left-0 ${top ? "bg-primary-soft" : "bg-bg"}`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex items-center justify-between gap-2 t-sub">
                        <span className={`${on ? "font-bold text-primary" : "text-text-1"}`}>
                          {pollOptionLabel(p.kind, o.label)}
                        </span>
                        <span className="shrink-0 tabular-nums text-text-2">
                          {o.count}명 · {pct}%
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {canWrite && p.kind === "date" && p.topIds.length === 1 && (
                <Link
                  href={`/town/groups/${groupId}?tab=schedule&date=${p.options.find((o) => o.id === p.topIds[0])?.label ?? ""}`}
                  className="btn-ghost flex min-h-[40px] items-center justify-center rounded-xl t-sub font-bold no-underline"
                >
                  {pollOptionLabel("date", p.options.find((o) => o.id === p.topIds[0])?.label ?? "")}로 일정 만들기
                </Link>
              )}
              {!p.closed && canWrite && changed && (
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void act({ action: "poll.vote", pollId: p.id, optionIds: picked }, p.id)}
                  className="btn-secondary min-h-[40px] rounded-xl t-sub font-bold disabled:opacity-60"
                >
                  {p.myVote.length > 0 ? "다시 투표" : "투표"}
                </button>
              )}
            </section>
          );
        })
      )}

      <PollForm
        groupId={groupId}
        open={open}
        minDate={minDate}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function PollForm({
  groupId,
  open,
  minDate,
  onClose,
  onDone,
}: {
  groupId: string;
  open: boolean;
  minDate: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"text" | "date">("text");
  const [options, setOptions] = useState<string[]>(["", "", ""]);
  const [multiple, setMultiple] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    const err = await clubPost(groupId, { action: "poll.create", title, kind, options, multiple });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setTitle("");
    setOptions(["", "", ""]);
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} label="투표 만들기" dismissOnBackdrop={!sending}>
      <ModalHeader title="투표 만들기" onClose={onClose} />
      <div className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="투표 제목 (예: 다음 임장 지역)"
          aria-label="투표 제목"
          className={FIELD}
        />
        <div className="flex gap-1.5">
          {(["text", "date"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setOptions(["", "", ""]);
              }}
              className={`chip min-h-[40px] px-4 t-sub font-bold ${
                kind === k ? "chip-active" : "border border-line bg-bg text-text-2"
              }`}
            >
              {k === "text" ? "텍스트" : "날짜"}
            </button>
          ))}
        </div>
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              type={kind === "date" ? "date" : "text"}
              min={kind === "date" ? minDate : undefined}
              value={o}
              onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={40}
              placeholder={`항목 ${i + 1}`}
              aria-label={`항목 ${i + 1}`}
              className={FIELD}
            />
            {options.length > 2 && (
              <button
                type="button"
                aria-label={`항목 ${i + 1} 빼기`}
                onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                className="btn-ghost h-12 w-10 shrink-0 rounded-xl t-body text-text-3"
              >
                −
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button
            type="button"
            onClick={() => setOptions((list) => [...list, ""])}
            className="btn-secondary min-h-[40px] rounded-xl t-sub font-bold"
          >
            항목 추가
          </button>
        )}
        <label className="flex min-h-[40px] items-center justify-between t-body text-ink">
          복수 선택 가능
          <input
            type="checkbox"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-primary)]"
          />
        </label>
        {error && <div className="t-sub font-semibold text-danger">{error}</div>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending}
          className="btn-primary rounded-xl p-3 t-body disabled:opacity-60"
        >
          {sending ? "만드는 중…" : "투표 올리기"}
        </button>
      </div>
    </Modal>
  );
}
