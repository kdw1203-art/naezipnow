/* [1168] 임장 모임 — 화면으로 내려가는 모양. 이메일은 여기 없다(표시명과 "내 것" 여부만). */
import type { ClubBoardId, PollOption } from "./club";

export type ScheduleView = {
  id: string;
  title: string;
  scheduledAt: string;
  place: string | null;
  complexId: string | null;
  maxMembers: number;
  mode: string | null;
  costTotal: number | null;
  authorLabel: string;
  attendeeCount: number;
  attendees: string[];
  joined: boolean;
  mine: boolean;
};

export type CommentView = { id: string; body: string; authorLabel: string; createdAt: string; mine: boolean };

export type PostView = {
  id: string;
  board: ClubBoardId;
  body: string;
  authorLabel: string;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
  scheduleTitle: string | null;
  noteId: string | null;
  noteTitle: string | null;
  comments: CommentView[];
};

export type PollView = {
  id: string;
  title: string;
  kind: "text" | "date";
  multiple: boolean;
  options: (PollOption & { count: number })[];
  voters: number;
  topIds: string[];
  myVote: string[];
  closed: boolean;
  mine: boolean;
  authorLabel: string;
  createdAt: string;
};

/** ok = 읽음 · missing = 테이블 없음(탭 숨김) · error = 조회 실패(실패 문구) */
export type Loaded<T> = { state: "ok"; data: T } | { state: "missing" } | { state: "error" };
