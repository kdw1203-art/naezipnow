"use client";
/* [1168] 모임 일정 — 달력 · 목록 · 참석 · 일정 만들기. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/components/IntentLink";
import { Modal, ModalHeader } from "@/app/components/ui/Modal";
import {
  SCHEDULE_MODES,
  countByDay,
  kstParts,
  monthGrid,
  perHead,
  scheduleIcs,
  scheduleState,
  scheduleStateLabel,
  shiftMonth,
  won,
} from "@/lib/groups/club";
import type { ScheduleView } from "@/lib/groups/club-types";
import { clubPost, FIELD } from "./club-post";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function ClubSchedule({
  groupId,
  schedules,
  canWrite,
  isOrganizer,
  nowIso,
  groupTitle,
  initialDate,
  myComplexes,
  initialComplex,
}: {
  groupId: string;
  schedules: ScheduleView[];
  canWrite: boolean;
  isOrganizer: boolean;
  nowIso: string;
  groupTitle: string;
  /** [1170] 날짜 투표에서 넘어온 날짜 — 있으면 그 날로 일정 만들기 창을 연다 */
  initialDate: string | null;
  /** [1171] 일정에 붙일 내 관심 단지 */
  myComplexes: { id: string; name: string }[];
  /** [1178] 단지 화면에서 넘어온 단지 — 있으면 그 단지를 고른 채로 만들기 창을 연다 */
  initialComplex: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const nowMs = Date.parse(nowIso);
  const today = kstParts(nowMs);
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const startYm = /^(\d{4})-(\d{2})-/.exec(initialDate ?? "");
  const [ym, setYm] = useState(
    startYm ? { year: Number(startYm[1]), month: Number(startYm[2]) } : { year: today?.y ?? 2026, month: today?.m ?? 1 },
  );
  const [day, setDay] = useState<string | null>(initialDate ?? today?.ymd ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState((Boolean(initialDate) || Boolean(initialComplex)) && canWrite);
  const complexChoices = initialComplex && !myComplexes.some((c) => c.id === initialComplex.id) ? [initialComplex, ...myComplexes] : myComplexes;

  const counts = useMemo(() => countByDay(schedules), [schedules]);
  const upcoming = schedules.filter((s) => Date.parse(s.scheduledAt) >= nowMs);
  const past = schedules.filter((s) => Date.parse(s.scheduledAt) < nowMs).reverse();
  const shown =
    view === "calendar" ? schedules.filter((s) => kstParts(s.scheduledAt)?.ymd === day) : [...upcoming, ...past];
  const weeks = monthGrid(ym.year, ym.month);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const err = await clubPost(groupId, body);
    setBusy(null);
    if (err) setError(err);
    else router.refresh();
  }
  const icsHref = (s: ScheduleView): string | null => {
    const ics = scheduleIcs(s, groupTitle, `https://naezipnow.com/town/groups/${groupId}?tab=schedule`);
    return ics ? `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` : null;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="t-section font-bold text-ink">
            다가오는 일정 <span className="text-primary">{upcoming.length}</span>
          </div>
          <div className="flex rounded-xl bg-bg p-1" role="tablist" aria-label="일정 보기">
            {(["list", "calendar"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`min-h-[40px] rounded-lg px-4 t-sub font-bold ${
                  view === v ? "bg-surface text-ink" : "text-text-3"
                }`}
              >
                {v === "list" ? "목록" : "달력"}
              </button>
            ))}
          </div>
        </div>

        {view === "calendar" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="t-body font-bold text-ink">
                {ym.year}년 {ym.month}월
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="이전 달"
                  onClick={() => setYm(shiftMonth(ym.year, ym.month, -1))}
                  className="btn-ghost h-10 w-10 rounded-lg t-body"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="다음 달"
                  onClick={() => setYm(shiftMonth(ym.year, ym.month, 1))}
                  className="btn-ghost h-10 w-10 rounded-lg t-body"
                >
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center t-sub text-text-3">
              {DOW.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((w, wi) => (
              <div key={wi} className="grid grid-cols-7 text-center">
                {w.map((d, di) => {
                  if (d === null) return <div key={di} />;
                  const ymd = `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const n = counts[ymd] ?? 0;
                  const sel = day === ymd;
                  return (
                    <button
                      key={di}
                      type="button"
                      onClick={() => setDay(ymd)}
                      aria-label={`${ym.month}월 ${d}일${n > 0 ? ` 일정 ${n}건` : ""}`}
                      aria-pressed={sel}
                      className={`mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-xl t-body tabular-nums ${
                        sel
                          ? "bg-ink font-bold text-surface"
                          : n > 0
                            ? "bg-primary-soft font-bold text-primary"
                            : ymd === today?.ymd
                              ? "border border-line text-ink"
                              : "text-text-2"
                      }`}
                    >
                      {d}
                      {n > 0 && <span className={`h-1 w-1 rounded-full ${sel ? "bg-surface" : "bg-primary"}`} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="t-sub font-semibold text-danger">{error}</div>}

      {shown.length === 0 ? (
        <div className="card p-5 text-center t-body text-text-3">일정 없음</div>
      ) : (
        shown.map((s) => {
          const p = kstParts(s.scheduledAt);
          const st = scheduleState(s, nowMs);
          const each = perHead(s.costTotal, s.attendeeCount);
          return (
            <div key={s.id} className="card flex gap-3 p-4">
              <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-bg py-2">
                <span className="t-caption text-text-3">{p?.m}월</span>
                <span className="t-section font-bold tabular-nums text-ink">{p?.d}</span>
                <span className="t-caption text-text-3">{p?.dow}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="t-body font-bold leading-[1.4] text-ink">{s.title}</div>
                <div className="t-sub text-text-2">
                  {[p?.time, s.place, `${s.attendeeCount}/${s.maxMembers}명`].filter(Boolean).join(" · ")}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-md chip-pad t-caption font-bold ${
                      st === "open" ? "bg-primary-soft text-primary" : "bg-bg text-text-3"
                    }`}
                  >
                    {scheduleStateLabel(st)}
                  </span>
                  {s.mode && <span className="rounded-md bg-bg chip-pad t-caption text-text-2">{s.mode}</span>}
                  {each !== null && s.costTotal !== null && (
                    <span className="rounded-md bg-bg chip-pad t-caption text-text-2">
                      1인 {won(each)} · 총 {won(s.costTotal)}
                    </span>
                  )}
                </div>
                {s.attendees.length > 0 && (
                  <div className="t-caption text-text-3">참석 {s.attendees.slice(0, 6).join(", ")}</div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {canWrite && st !== "past" && (s.joined || st === "open") && (
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() =>
                        void act({ action: s.joined ? "schedule.leave" : "schedule.attend", scheduleId: s.id }, s.id)
                      }
                      className="btn-secondary min-h-[40px] rounded-xl px-4 t-sub font-bold disabled:opacity-60"
                    >
                      {s.joined ? "참석 취소" : "참석"}
                    </button>
                  )}
                  {st !== "past" && s.joined && icsHref(s) && (
                    <a
                      href={icsHref(s) ?? undefined}
                      download={`${s.title}.ics`}
                      className="btn-ghost flex min-h-[40px] items-center rounded-xl px-3 t-sub font-bold no-underline"
                    >
                      캘린더 저장
                    </a>
                  )}
                  {s.complexId && (
                    <Link
                      prefetch={false}
                      href={`/complex/${encodeURIComponent(s.complexId)}`}
                      className="btn-ghost flex min-h-[40px] items-center rounded-xl px-3 t-sub font-bold no-underline"
                    >
                      단지 보기
                    </Link>
                  )}
                  {canWrite && st === "past" && s.joined && (
                    <Link
                      href={`/town/groups/${groupId}?tab=board&write=review&schedule=${s.id}`}
                      className="btn-secondary flex min-h-[40px] items-center rounded-xl px-4 t-sub font-bold no-underline"
                    >
                      후기 쓰기
                    </Link>
                  )}
                  {canWrite && st !== "past" && (s.mine || isOrganizer) && (
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => void act({ action: "schedule.cancel", scheduleId: s.id }, s.id)}
                      className="btn-ghost min-h-[40px] rounded-xl px-3 t-sub text-text-3 disabled:opacity-60"
                    >
                      일정 취소
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {canWrite && (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary rounded-xl p-3.5 t-body font-bold">
          일정 만들기
        </button>
      )}

      <ScheduleForm
        groupId={groupId}
        open={open}
        myComplexes={complexChoices}
        initialComplex={initialComplex}
        defaultDate={day ?? today?.ymd ?? ""}
        minDate={today?.ymd ?? ""}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function ScheduleForm({
  groupId,
  open,
  myComplexes,
  initialComplex,
  defaultDate,
  minDate,
  onClose,
  onDone,
}: {
  groupId: string;
  open: boolean;
  myComplexes: { id: string; name: string }[];
  initialComplex: { id: string; name: string } | null;
  defaultDate: string;
  minDate: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(initialComplex ? `${initialComplex.name} 임장` : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("14:00");
  const [place, setPlace] = useState("");
  const [maxMembers, setMaxMembers] = useState("4");
  const [mode, setMode] = useState<string>(SCHEDULE_MODES[0]);
  const [cost, setCost] = useState("");
  const [complexId, setComplexId] = useState(initialComplex?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useDate = date || (defaultDate >= minDate ? defaultDate : minDate);

  async function submit() {
    setSending(true);
    setError(null);
    const err = await clubPost(groupId, {
      action: "schedule.create",
      title,
      date: useDate,
      time,
      place,
      maxMembers: Number(maxMembers),
      mode,
      costTotal: cost === "" ? null : Number(cost),
      complexId: complexId || null,
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setTitle("");
    setPlace("");
    setCost("");
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} label="일정 만들기" dismissOnBackdrop={!sending}>
      <ModalHeader title="일정 만들기" onClose={onClose} />
      <div className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="일정 이름 (예: 마포래미안푸르지오 도보 임장)"
          aria-label="일정 이름"
          className={FIELD}
        />
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 t-sub font-bold text-text-2">
            날짜
            <input type="date" value={useDate} min={minDate} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          </label>
          <label className="flex w-[120px] flex-col gap-1 t-sub font-bold text-text-2">
            시간
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={FIELD} />
          </label>
        </div>
        {myComplexes.length > 0 && (
          <label className="flex flex-col gap-1 t-sub font-bold text-text-2">
            볼 단지 · 내 관심 단지에서 선택
            <select
              value={complexId}
              onChange={(e) => {
                const id = e.target.value;
                setComplexId(id);
                const c = myComplexes.find((x) => x.id === id);
                if (c && !title.trim()) setTitle(`${c.name} 임장`);
              }}
              className={FIELD}
            >
              <option value="">선택 안 함</option>
              {myComplexes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={80}
          placeholder="집결 장소 (예: 공덕역 1번 출구)"
          aria-label="집결 장소"
          className={FIELD}
        />
        <div className="flex gap-2">
          <label className="flex w-[90px] flex-col gap-1 t-sub font-bold text-text-2">
            인원
            <input
              type="number"
              min={2}
              max={50}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 t-sub font-bold text-text-2">
            비용 합계(원) · 선택
            <input
              type="number"
              min={0}
              step={1000}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className={FIELD}
            />
          </label>
        </div>
        <div>
          <div className="mb-1.5 t-sub font-bold text-text-2">진행 방식</div>
          <div className="flex flex-wrap gap-1.5">
            {SCHEDULE_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`chip min-h-[40px] px-3 t-sub font-bold ${
                  mode === m ? "chip-active" : "border border-line bg-bg text-text-2"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="t-sub font-semibold text-danger">{error}</div>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending}
          className="btn-primary rounded-xl p-3 t-body disabled:opacity-60"
        >
          {sending ? "만드는 중…" : "일정 만들기"}
        </button>
        <p className="t-caption text-text-3">비용은 참석 인원으로 나눈 금액만 표시 · 송금 기능 없음</p>
      </div>
    </Modal>
  );
}
