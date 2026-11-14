/* [1168] 임장 모임 — 일정 · 게시판 · 투표의 순수 계산.
   서버 저장소(club-store)와 화면이 같이 쓴다. 여기에는 DB·세션이 없다. */

export const CLUB_BOARDS = [
  { id: "notice", label: "공지" },
  { id: "free", label: "자유" },
  { id: "review", label: "일정 후기" },
  { id: "hello", label: "가입 인사" },
] as const;
export type ClubBoardId = (typeof CLUB_BOARDS)[number]["id"];

export const SCHEDULE_MODES = ["도보 임장", "차량 임장", "중개사무소 방문", "모델하우스", "스터디"] as const;

export const CLUB_TABS = [
  { id: "home", label: "홈" },
  { id: "schedule", label: "일정" },
  { id: "board", label: "게시판" },
  { id: "poll", label: "투표" },
] as const;
export type ClubTabId = (typeof CLUB_TABS)[number]["id"];

export function clubTab(raw: unknown): ClubTabId {
  const v = typeof raw === "string" ? raw : "";
  return (CLUB_TABS.find((t) => t.id === v)?.id ?? "home") as ClubTabId;
}

export function boardLabel(id: string): string {
  return CLUB_BOARDS.find((b) => b.id === id)?.label ?? "자유";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

function text(v: unknown, max: number): string {
  return (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max);
}

/* ── 한국 시간 ─────────────────────────────────────────── */
const KST = 9 * 3600 * 1000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type KstParts = { ymd: string; y: number; m: number; d: number; dow: string; time: string };

export function kstParts(iso: string | number): KstParts | null {
  const ts = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const k = new Date(ts + KST);
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  const h = k.getUTCHours();
  const mi = k.getUTCMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    ymd: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    y,
    m,
    d,
    dow: DOW[k.getUTCDay()],
    time: `${h < 12 ? "오전" : "오후"} ${h12}:${String(mi).padStart(2, "0")}`,
  };
}

/** "2026-11-14" + "14:30" (한국 시간) → ISO. 형식이 틀리면 null. */
export function kstToIso(ymd: string, hm: string): string | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const b = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!a || !b) return null;
  const [y, m, d] = [Number(a[1]), Number(a[2]), Number(a[3])];
  const [h, mi] = [Number(b[1]), Number(b[2])];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ts = Date.UTC(y, m - 1, d, h, mi) - KST;
  const back = kstParts(ts);
  if (!back || back.ymd !== ymd) return null;
  return new Date(ts).toISOString();
}

/** 달력 한 달 — 일요일 시작, 빈 칸은 null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + by;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/* ── 일정 ─────────────────────────────────────────────── */
export type ScheduleInput = {
  title: string;
  scheduledAt: string;
  place: string | null;
  complexId: string | null;
  maxMembers: number;
  mode: string | null;
  costTotal: number | null;
};

export function validateSchedule(
  raw: Record<string, unknown>,
  nowMs: number,
): { ok: true; value: ScheduleInput } | { ok: false; message: string } {
  const title = text(raw.title, 60);
  if (title.length < 2) return { ok: false, message: "일정 이름 2자 이상" };
  const iso =
    typeof raw.scheduledAt === "string" && raw.scheduledAt
      ? raw.scheduledAt
      : kstToIso(String(raw.date ?? ""), String(raw.time ?? ""));
  const ts = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ts)) return { ok: false, message: "날짜와 시간 확인" };
  if (ts < nowMs - 5 * 60 * 1000) return { ok: false, message: "지난 시각은 선택 불가" };
  if (ts > nowMs + 366 * 86400 * 1000) return { ok: false, message: "1년 이내 일정만 가능" };
  const maxMembers = Math.round(Number(raw.maxMembers));
  if (!Number.isFinite(maxMembers) || maxMembers < 2 || maxMembers > 50) {
    return { ok: false, message: "인원 2~50명" };
  }
  const mode = text(raw.mode, 20);
  let costTotal: number | null = null;
  if (raw.costTotal !== undefined && raw.costTotal !== null && raw.costTotal !== "") {
    const c = Math.round(Number(raw.costTotal));
    if (!Number.isFinite(c) || c < 0 || c > 10_000_000) return { ok: false, message: "비용 0~1,000만원" };
    costTotal = c;
  }
  return {
    ok: true,
    value: {
      title,
      scheduledAt: new Date(ts).toISOString(),
      place: text(raw.place, 80) || null,
      complexId: text(raw.complexId, 40) || null,
      maxMembers,
      mode: (SCHEDULE_MODES as readonly string[]).includes(mode) ? mode : null,
      costTotal,
    },
  };
}

export type ScheduleState = "past" | "full" | "open";

export function scheduleState(
  s: { scheduledAt: string; maxMembers: number; attendeeCount: number },
  nowMs: number,
): ScheduleState {
  const ts = Date.parse(s.scheduledAt);
  if (Number.isFinite(ts) && ts < nowMs) return "past";
  return s.attendeeCount >= s.maxMembers ? "full" : "open";
}

export function scheduleStateLabel(st: ScheduleState): string {
  return st === "past" ? "지난 일정" : st === "full" ? "마감" : "모집 중";
}

/** 비용 ÷ 참석 인원 — 10원 단위 올림. 돈을 옮기지 않는다(계산만). */
export function perHead(costTotal: number | null, attendees: number): number | null {
  if (costTotal === null || !Number.isFinite(costTotal) || costTotal <= 0 || attendees < 1) return null;
  return Math.ceil(costTotal / attendees / 10) * 10;
}

export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 일정 한 줄 — "11월 14일 (토) 오후 2:00 · 마포역 3번 출구 · 3/6명" */
export function scheduleLine(s: {
  scheduledAt: string;
  place: string | null;
  maxMembers: number;
  attendeeCount: number;
}): string {
  const p = kstParts(s.scheduledAt);
  const when = p ? `${p.m}월 ${p.d}일 (${p.dow}) ${p.time}` : "일시 미정";
  return [when, s.place, `${s.attendeeCount}/${s.maxMembers}명`].filter(Boolean).join(" · ");
}

/** [1170] 내 캘린더에 넣는 .ics 한 건 — 2시간짜리 일정으로 적는다(끝 시각을 받지 않으므로). */
export function scheduleIcs(
  s: { id: string; title: string; scheduledAt: string; place: string | null },
  groupTitle: string,
  url: string,
): string | null {
  const ts = Date.parse(s.scheduledAt);
  if (!Number.isFinite(ts)) return null;
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//naezipnow//group-schedule//KO",
    "BEGIN:VEVENT",
    `UID:${s.id}@naezipnow.com`,
    `DTSTAMP:${stamp(ts)}`,
    `DTSTART:${stamp(ts)}`,
    `DTEND:${stamp(ts + 2 * 3600 * 1000)}`,
    `SUMMARY:${esc(`${s.title} · ${groupTitle}`.replace(/ · $/, ""))}`,
    ...(s.place ? [`LOCATION:${esc(s.place)}`] : []),
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** 달력 표시용 — 날짜(ymd)별 일정 수. */
export function countByDay(items: readonly { scheduledAt: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const p = kstParts(it.scheduledAt);
    if (p) out[p.ymd] = (out[p.ymd] ?? 0) + 1;
  }
  return out;
}

/* ── 게시판 ───────────────────────────────────────────── */
export type PostInput = {
  board: ClubBoardId;
  body: string;
  scheduleId: string | null;
  noteId: string | null;
  parentId: string | null;
};

export function validatePost(
  raw: Record<string, unknown>,
): { ok: true; value: PostInput } | { ok: false; message: string } {
  const body = (typeof raw.body === "string" ? raw.body : "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
  if (!body) return { ok: false, message: "내용 입력" };
  const parentId = isUuid(raw.parentId) ? raw.parentId : null;
  const boardRaw = typeof raw.board === "string" ? raw.board : "free";
  const board = (CLUB_BOARDS.find((b) => b.id === boardRaw)?.id ?? "free") as ClubBoardId;
  return {
    ok: true,
    value: {
      board,
      body,
      scheduleId: isUuid(raw.scheduleId) ? raw.scheduleId : null,
      noteId: isUuid(raw.noteId) ? raw.noteId : null,
      parentId,
    },
  };
}

/* ── 투표 ─────────────────────────────────────────────── */
export type PollOption = { id: string; label: string };
export type PollInput = { title: string; kind: "text" | "date"; options: PollOption[]; multiple: boolean };

export function validatePoll(
  raw: Record<string, unknown>,
): { ok: true; value: PollInput } | { ok: false; message: string } {
  const title = text(raw.title, 60);
  if (title.length < 2) return { ok: false, message: "투표 제목 2자 이상" };
  const kind = raw.kind === "date" ? "date" : "text";
  const list = Array.isArray(raw.options) ? raw.options : [];
  const seen = new Set<string>();
  const options: PollOption[] = [];
  for (const o of list) {
    const label = text(o, 40);
    if (!label || seen.has(label)) continue;
    if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(label)) continue;
    seen.add(label);
    options.push({ id: `o${options.length + 1}`, label });
    if (options.length >= 10) break;
  }
  if (options.length < 2) return { ok: false, message: "항목 2개 이상" };
  if (kind === "date") options.sort((a, b) => (a.label < b.label ? -1 : 1));
  return { ok: true, value: { title, kind, options, multiple: raw.multiple === true } };
}

export function parsePollOptions(raw: unknown): PollOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PollOption[] = [];
  for (const o of raw) {
    if (o && typeof o === "object") {
      const id = String((o as { id?: unknown }).id ?? "");
      const label = String((o as { label?: unknown }).label ?? "");
      if (id && label) out.push({ id, label });
    }
  }
  return out;
}

/** 고른 항목을 투표 규칙에 맞게 정리. 고를 수 없는 조합이면 null. */
export function sanitizeVote(options: readonly PollOption[], picked: unknown, multiple: boolean): string[] | null {
  if (!Array.isArray(picked)) return null;
  const valid = new Set(options.map((o) => o.id));
  const ids = [...new Set(picked.map((p) => String(p)))].filter((p) => valid.has(p));
  if (ids.length === 0) return null;
  if (!multiple && ids.length > 1) return null;
  return ids;
}

export type PollTally = { counts: Record<string, number>; voters: number; topIds: string[] };

export function tallyPoll(options: readonly PollOption[], votes: readonly { optionIds: readonly string[] }[]): PollTally {
  const counts: Record<string, number> = {};
  for (const o of options) counts[o.id] = 0;
  let voters = 0;
  for (const v of votes) {
    const ids = v.optionIds.filter((id) => id in counts);
    if (ids.length === 0) continue;
    voters += 1;
    for (const id of new Set(ids)) counts[id] += 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const topIds = max > 0 ? options.filter((o) => counts[o.id] === max).map((o) => o.id) : [];
  return { counts, voters, topIds };
}

/** 날짜 투표 항목 "2026-11-14" → "11월 14일 (토)". 텍스트 항목은 그대로. */
export function pollOptionLabel(kind: string, label: string): string {
  if (kind !== "date") return label;
  const iso = kstToIso(label, "12:00");
  const p = iso ? kstParts(iso) : null;
  return p ? `${p.m}월 ${p.d}일 (${p.dow})` : label;
}

/* ── 저장소 준비 여부 ─────────────────────────────────── */
/** 테이블이 아직 없는 DB(이관 전)인지 — 그때는 화면에서 해당 탭을 숨긴다. */
export function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|schema cache|could not find the table/i.test(error.message ?? "");
}

/* ── [1179] 일정 전날 알림 ─────────────────────────────── */
export const GROUP_REMINDER_TITLE = "내일 모임 일정";

/** 한국 날짜로 "내일" 하루의 시작 · 끝(ISO) */
export function kstTomorrowRange(nowMs: number): { from: string; to: string; ymd: string } {
  const DAY = 86400 * 1000;
  const dayIdx = Math.floor((nowMs + KST) / DAY) + 1;
  const from = dayIdx * DAY - KST;
  return { from: new Date(from).toISOString(), to: new Date(from + DAY).toISOString(), ymd: new Date(from + KST).toISOString().slice(0, 10) };
}

/** 알림 본문 — "오후 2:00 성수 전략정비구역 둘러보기 · 성수역 3번 출구 · 마포 모임" */
export function groupReminderBody(s: { title: string; scheduledAt: string; place: string | null }, groupTitle: string): string {
  const p = kstParts(s.scheduledAt);
  return [`${p ? `${p.time} ` : ""}${s.title}`, s.place, groupTitle].filter(Boolean).join(" · ");
}
