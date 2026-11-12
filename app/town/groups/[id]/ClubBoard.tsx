"use client";
/* [1168] 모임 게시판 — 공지 · 자유 · 일정 후기 · 가입 인사. 후기에는 일정과 내 임장노트를 붙인다. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/IntentLink";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import { CLUB_BOARDS, boardLabel, kstParts, type ClubBoardId } from "@/lib/groups/club";
import type { PostView } from "@/lib/groups/club-types";
import { clubPost, FIELD } from "./club-post";

type Pick = { id: string; title: string };

function when(iso: string): string {
  const p = kstParts(iso);
  return p ? `${p.m}월 ${p.d}일 ${p.time}` : "";
}

export function ClubBoard({
  groupId,
  posts,
  canWrite,
  isOrganizer,
  myNotes,
  pastSchedules,
  initialWrite,
  initialSchedule,
}: {
  groupId: string;
  posts: PostView[];
  canWrite: boolean;
  isOrganizer: boolean;
  myNotes: Pick[];
  pastSchedules: Pick[];
  initialWrite: ClubBoardId | null;
  initialSchedule: string | null;
}) {
  const router = useRouter();
  const [board, setBoard] = useState<ClubBoardId | "all">("all");
  const [open, setOpen] = useState(initialWrite !== null && canWrite);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});

  const shown = board === "all" ? posts : posts.filter((p) => p.board === board);
  const count = (b: ClubBoardId) => posts.filter((p) => p.board === b).length;

  async function act(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    const err = await clubPost(groupId, body);
    setBusy(null);
    if (err) {
      setError(err);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="게시판 분류">
        <button
          type="button"
          role="tab"
          aria-selected={board === "all"}
          onClick={() => setBoard("all")}
          className={`chip min-h-[40px] shrink-0 px-3.5 t-sub font-bold ${
            board === "all" ? "chip-active" : "border border-line bg-surface text-text-2"
          }`}
        >
          전체 {posts.length}
        </button>
        {CLUB_BOARDS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={board === b.id}
            onClick={() => setBoard(b.id)}
            className={`chip min-h-[40px] shrink-0 px-3.5 t-sub font-bold ${
              board === b.id ? "chip-active" : "border border-line bg-surface text-text-2"
            }`}
          >
            {b.label} {count(b.id)}
          </button>
        ))}
      </div>

      {canWrite && (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary rounded-xl p-3.5 t-body font-bold">
          글쓰기
        </button>
      )}
      {error && <div className="t-sub font-semibold text-danger">{error}</div>}

      {shown.length === 0 ? (
        <div className="card p-5 text-center t-body text-text-3">글 없음</div>
      ) : (
        shown.map((p) => (
          <article key={p.id} className="card flex flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`shrink-0 rounded-md chip-pad t-caption font-bold ${
                    p.board === "notice" ? "bg-warning-soft text-warning" : "bg-bg text-text-2"
                  }`}
                >
                  {boardLabel(p.board)}
                </span>
                <span className="truncate t-sub font-bold text-ink">{p.authorLabel}</span>
                <span className="shrink-0 t-caption text-text-3">{when(p.createdAt)}</span>
              </div>
              {p.canDelete && (
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void act({ action: "post.hide", postId: p.id }, p.id)}
                  className="btn-ghost min-h-[40px] shrink-0 rounded-lg px-2 t-caption text-text-3 disabled:opacity-60"
                >
                  내리기
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap t-body leading-[1.7] text-text-1">{p.body}</p>
            {(p.scheduleTitle || p.noteId) && (
              <div className="flex flex-col gap-1.5">
                {p.scheduleTitle && (
                  <div className="rounded-xl bg-bg px-3 py-2.5 t-sub text-text-2">일정 · {p.scheduleTitle}</div>
                )}
                {p.noteId && (
                  <Link
                    prefetch={false}
                    href={`/notes/${p.noteId}`}
                    className="rounded-xl bg-primary-soft px-3 py-2.5 t-sub font-bold text-primary no-underline"
                  >
                    임장노트 · {p.noteTitle || "노트 보기"} ›
                  </Link>
                )}
              </div>
            )}
            {p.comments.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-line pt-2.5">
                {p.comments.map((c) => (
                  <li key={c.id} className="t-sub leading-[1.6] text-text-2">
                    <span className="font-bold text-ink">{c.authorLabel}</span> {c.body}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <div className="flex gap-2">
                <input
                  value={reply[p.id] ?? ""}
                  onChange={(e) => setReply((r) => ({ ...r, [p.id]: e.target.value }))}
                  maxLength={300}
                  placeholder="댓글"
                  aria-label="댓글"
                  className="min-h-[40px] w-full rounded-xl border border-line bg-bg px-3 t-sub text-ink outline-none placeholder:text-text-3 focus:border-primary"
                />
                <button
                  type="button"
                  disabled={busy === `c-${p.id}` || !(reply[p.id] ?? "").trim()}
                  onClick={async () => {
                    const ok = await act({ action: "post.create", parentId: p.id, body: reply[p.id] }, `c-${p.id}`);
                    if (ok) setReply((r) => ({ ...r, [p.id]: "" }));
                  }}
                  className="btn-secondary min-h-[40px] shrink-0 rounded-xl px-3.5 t-sub font-bold disabled:opacity-60"
                >
                  등록
                </button>
              </div>
            )}
          </article>
        ))
      )}

      <PostForm
        groupId={groupId}
        open={open}
        isOrganizer={isOrganizer}
        myNotes={myNotes}
        pastSchedules={pastSchedules}
        initialBoard={initialWrite ?? (board === "all" || (board === "notice" && !isOrganizer) ? "free" : board)}
        initialSchedule={initialSchedule}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function PostForm({
  groupId,
  open,
  isOrganizer,
  myNotes,
  pastSchedules,
  initialBoard,
  initialSchedule,
  onClose,
  onDone,
}: {
  groupId: string;
  open: boolean;
  isOrganizer: boolean;
  myNotes: Pick[];
  pastSchedules: Pick[];
  initialBoard: ClubBoardId;
  initialSchedule: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<ClubBoardId | null>(null);
  const board = picked ?? initialBoard;
  const [body, setBody] = useState("");
  const [scheduleId, setScheduleId] = useState(initialSchedule ?? "");
  const [noteId, setNoteId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boards = CLUB_BOARDS.filter((b) => b.id !== "notice" || isOrganizer);

  async function submit() {
    setSending(true);
    setError(null);
    const err = await clubPost(groupId, {
      action: "post.create",
      board,
      body,
      scheduleId: board === "review" ? scheduleId || null : null,
      noteId: noteId || null,
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setBody("");
    setNoteId("");
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} label="모임 글쓰기" dismissOnBackdrop={!sending}>
      <ModalHeader title="모임 글쓰기" onClose={onClose} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={board === b.id}
              onClick={() => setPicked(b.id)}
              className={`chip min-h-[40px] px-3 t-sub font-bold ${
                board === b.id ? "chip-active" : "border border-line bg-bg text-text-2"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {board === "review" && pastSchedules.length > 0 && (
          <label className="flex flex-col gap-1 t-sub font-bold text-text-2">
            다녀온 일정
            <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className={FIELD}>
              <option value="">선택 안 함</option>
              {pastSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="내용"
          aria-label="내용"
          className={`${FIELD} resize-none`}
        />
        {myNotes.length > 0 && (
          <label className="flex flex-col gap-1 t-sub font-bold text-text-2">
            내 임장노트 붙이기 · 선택
            <select value={noteId} onChange={(e) => setNoteId(e.target.value)} className={FIELD}>
              <option value="">붙이지 않음</option>
              {myNotes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <div className="t-sub font-semibold text-danger">{error}</div>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !body.trim()}
          className="btn-primary rounded-xl p-3 t-body disabled:opacity-60"
        >
          {sending ? "올리는 중…" : "올리기"}
        </button>
        <p className="t-caption text-text-3">전화번호 · 계좌번호 금지 · 비공개 노트는 본인만 열람</p>
      </div>
    </Modal>
  );
}
