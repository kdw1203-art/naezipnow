"use client";

/**
 * [1008 · J] 여정 진행 — 브라우저 저장소 한 곳(모듈 싱글톤 + useSyncExternalStore).
 * /journey 와 /journey/contract 가 같은 상태를 본다.
 *
 * 흐름
 *  1. 로그인 힌트(nz_authed, lib/auth/authed-hint)가 없으면 **요청 없이** 비회원 — 이 기기(비회원 사본)에만 저장.
 *     (페이지를 여는 것만으로 비회원·봇이 API 를 치지 않는다 — 1007 V7 원칙)
 *     비회원 화면은 계정 사본(저장 못 한 계정 진행)을 읽지 않고 지운다(lib/journey/local.ts ②).
 *  2. 힌트가 있으면 getSessionLite(공유 프라미스) → 세션이 있으면 GET /api/me/journey.
 *     서버 상태 ← 이 계정의 저장 못 한 사본 ← 비회원 사본 ← 불러오는 동안의 변경(lib/journey/sync.ts composeAccountState)
 *     을 한 번 PUT 하고, 성공하면 사본들을 비운다 — 비회원 사본은 그 사이 다른 탭이 새로 적지 않았을 때만.
 *     - 불러오는 동안(ready=false) 입력칸은 막혀 있다. 그래도 들어온 변경은 사본에 적지 않고 줄 세웠다가 계정 상태
 *       위에 다시 적용한다(리뷰 C race2.mjs — 예전엔 매매가 한 칸이 계정의 계약일·잔금일·체크를 지웠다).
 *     - 조회가 실패하면 서버 것을 모르니 PUT 하지 않는다 — 이 기기의 사본들로 보여 주고, 바꾸면 계정 사본에만 적는다.
 *     - 저장(PUT)이 실패하면 계정 사본(주인 표식)에 적는다 — 비회원 사본에는 절대 적지 않는다(리뷰 C leak.mjs).
 *       다음 변경 때 다시 저장해 보고, 되면 계정 저장으로 돌아간다.
 *  3. 계정 모드의 변경은 0.5초 모아 PUT(누를 때마다 요청하지 않는다), 페이지를 떠날 때 남은 것은 keepalive 로.
 */
import { useSyncExternalStore } from "react";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { getSessionLite } from "@/lib/client/session-lite";
import {
  accountOwnerTag,
  clearAccountCopy,
  clearLocalJourney,
  JOURNEY_LOCAL_KEY,
  parseLocalJourney,
  readAccountCopy,
  readLocalJourney,
  readLocalRaw,
  writeAccountCopy,
  writeLocalJourney,
} from "./local";
import {
  emptyJourneyState,
  isJourneyEmpty,
  mergeJourneyStates,
  normalizeJourneyState,
  sameJourneyContent,
  type JourneyState,
} from "./state";
import { applyJourneyOps, composeAccountState, type JourneyOp } from "./sync";

export type JourneySync =
  /** 비회원 — 이 기기에 저장 */
  | "guest"
  /** 로그인 확인·계정 진행 불러오는 중 */
  | "loading"
  /** 계정에 저장됨 */
  | "account"
  /** 계정에 저장하는 중 */
  | "saving"
  /** 로그인했지만 계정 조회·저장 실패 — 이 기기(계정 사본)에 임시 저장 */
  | "fallback";

export type JourneySnapshot = { state: JourneyState; ready: boolean; sync: JourneySync };

const API = "/api/me/journey";
const PUT_DEBOUNCE_MS = 500;

const INITIAL: JourneySnapshot = { state: emptyJourneyState(), ready: false, sync: "guest" };
let snap: JourneySnapshot = INITIAL;
const listeners = new Set<() => void>();
let started = false;
let mode: "pending" | "guest" | "account" | "fallback" = "pending";
let putTimer: number | null = null;
let pendingPut: JourneyState | null = null;
/** 로그인 사용자의 주인 표식(lib/journey/local accountOwnerTag) — 계정 사본을 읽고 쓸 때만 */
let owner: string | null = null;
/** 지금 상태가 갈라져 나온 서버 상태의 updatedAt — 계정 사본에 같이 적는다 */
let serverVersion: string | null = null;
/** 이번 페이지에서 서버 상태를 읽었는가 — 못 읽었으면 PUT 하지 않는다(모르는 계정 진행을 덮어쓰지 않게) */
let serverKnown = false;
/** 불러오는 동안 들어온 변경 — 계정 상태가 정해지면 그 위에 다시 적용한다 */
let pendingOps: JourneyOp[] = [];

function emit(next: JourneySnapshot): void {
  snap = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  ensureStarted();
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = () => snap;
const getServerSnapshot = () => INITIAL;

/** 여정 진행 — 서버 렌더·첫 렌더는 빈 상태(ready=false), 마운트 뒤 이 기기/계정 값으로 바뀐다. */
export function useJourney(): JourneySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function ensureStarted(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  queueMicrotask(start);
}

function nowIso(): string {
  return new Date().toISOString();
}

function takeOps(): JourneyOp[] {
  const ops = pendingOps;
  pendingOps = [];
  return ops;
}

function start(): void {
  window.addEventListener("storage", (e) => {
    if (e.key !== JOURNEY_LOCAL_KEY || mode !== "guest") return;
    emit({ ...snap, state: readLocalJourney() });
  });
  window.addEventListener("pagehide", flushPut);
  if (!readAuthedHint()) {
    becomeGuest();
    return;
  }
  mode = "pending";
  emit({ state: emptyJourneyState(), ready: false, sync: "loading" });
  void loadAccount();
}

/** 비회원 — 이 기기의 비회원 사본만. 계정 사본은 읽지도 합치지도 않고 지운다(로그아웃 뒤 남에게 보이지 않게). */
function becomeGuest(): void {
  mode = "guest";
  owner = null;
  clearAccountCopy();
  let state = readLocalJourney();
  const ops = takeOps();
  if (ops.length > 0) {
    state = applyJourneyOps(state, ops);
    writeLocalJourney(state);
  }
  emit({ state, ready: true, sync: "guest" });
}

async function putState(state: JourneyState, keepalive = false): Promise<JourneyState | null> {
  try {
    const res = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
      keepalive,
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { state?: unknown } | null;
    return body && "state" in body ? normalizeJourneyState(body.state) : null;
  } catch {
    return null;
  }
}

async function loadAccount(): Promise<void> {
  const session = await getSessionLite().catch(() => null);
  const email = session?.user?.email;
  if (!email) {
    /* 힌트는 있었지만 세션이 없다(만료) — 비회원. 주인을 확인할 수 없으니 계정 사본은 지운다. */
    becomeGuest();
    return;
  }
  owner = await accountOwnerTag(email);

  let server: JourneyState;
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) throw new Error(`journey GET ${res.status}`);
    const body = (await res.json()) as { state?: unknown };
    server = normalizeJourneyState(body.state);
  } catch {
    /* 조회 실패 — 서버 것을 모르니 PUT 하지 않는다. 이 계정의 저장 못 한 사본 + 비회원 사본을 보여 주고,
       바꾸면 계정 사본에만 적는다(다음에 열 때 서버와 합친다). 비회원 사본은 그대로 둔다. */
    const copy = readAccountCopy(owner);
    serverKnown = false;
    serverVersion = copy?.base ?? null;
    let state = copy?.state ?? emptyJourneyState();
    const guest = readLocalJourney();
    if (!isJourneyEmpty(guest)) state = mergeJourneyStates(guest, state, nowIso());
    const ops = takeOps();
    if (ops.length > 0) {
      state = applyJourneyOps(state, ops);
      writeAccountCopy(owner, serverVersion, state);
    }
    mode = "fallback";
    emit({ state, ready: true, sync: "fallback" });
    return;
  }

  serverKnown = true;
  serverVersion = server.updatedAt;
  const copy = readAccountCopy(owner);
  /* 비회원 사본은 원문째 기억한다 — 저장한 뒤 "그 사이 다른 탭이 새로 적었는가"를 가린다 */
  const guestRaw = readLocalRaw();
  let next = composeAccountState({
    server,
    copy,
    guest: parseLocalJourney(guestRaw),
    ops: takeOps(),
    nowIso: nowIso(),
  });

  /* 서버에 지금 있는 것 — 바꿀 게 없으면 서버 그대로, 저장했으면 서버가 정규화해 돌려준 것 */
  let saved: JourneyState = server;
  if (!sameJourneyContent(next, server)) {
    const res = await putState(next);
    if (!res) {
      /* 저장 실패 — 계정 사본(주인 표식)에만. 비회원 사본은 지우지 않는다(다음에 다시 합친다). */
      next = applyJourneyOps(next, takeOps());
      mode = "fallback";
      writeAccountCopy(owner, serverVersion, next);
      emit({ state: next, ready: true, sync: "fallback" });
      return;
    }
    saved = res;
    serverVersion = res.updatedAt;
  }
  /* 저장하는 사이 들어온 변경을 얹는다 */
  const tail = takeOps();
  next = applyJourneyOps(saved, tail);
  /* 합쳤으니 사본을 비운다 — 비회원 사본은 그 사이 다른 탭이 새로 적지 않았을 때만(적었으면 다음에 다시 합친다) */
  if (readLocalRaw() === guestRaw) clearLocalJourney();
  clearAccountCopy();
  mode = "account";
  if (tail.length > 0 && !sameJourneyContent(next, saved)) {
    emit({ state: next, ready: true, sync: "saving" });
    schedulePut(next);
    return;
  }
  emit({ state: next, ready: true, sync: "account" });
}

function schedulePut(state: JourneyState): void {
  pendingPut = state;
  if (putTimer !== null) window.clearTimeout(putTimer);
  putTimer = window.setTimeout(() => {
    putTimer = null;
    void runPut();
  }, PUT_DEBOUNCE_MS);
}

async function runPut(): Promise<void> {
  const state = pendingPut;
  pendingPut = null;
  if (!state) return;
  const saved = await putState(state);
  if (pendingPut) return; // 그 사이 새 변경이 줄을 섰다 — 그 저장이 상태를 정한다
  if (saved) {
    serverVersion = saved.updatedAt;
    if (mode === "fallback") {
      /* 다시 저장됐다 — 계정 저장으로 돌아가고 사본은 지운다 */
      mode = "account";
      clearAccountCopy();
    }
    emit({ ...snap, sync: "account" });
    return;
  }
  /* 저장 실패 — 잃지 않게 이 계정의 사본(주인 표식)에 적는다. 비회원 사본에는 적지 않는다. */
  mode = "fallback";
  if (owner) writeAccountCopy(owner, serverVersion, snap.state);
  emit({ ...snap, sync: "fallback" });
}

function flushPut(): void {
  if (!pendingPut) return;
  const state = pendingPut;
  pendingPut = null;
  if (putTimer !== null) {
    window.clearTimeout(putTimer);
    putTimer = null;
  }
  void putState(state, true);
}

/** 상태를 바꾼다 — 비회원은 이 기기에 즉시, 계정은 모아서 PUT, 불러오는 중이면 줄 세웠다가 계정 상태 위에 다시 적용. */
export function updateJourney(fn: JourneyOp): JourneyState {
  const next = fn(snap.state);
  switch (mode) {
    case "account":
      emit({ ...snap, state: next, sync: "saving" });
      schedulePut(next);
      break;
    case "fallback":
      if (owner) writeAccountCopy(owner, serverVersion, next);
      if (serverKnown) {
        /* 서버 것을 읽은 적이 있으면 다시 저장해 본다 — 되면 계정 저장으로 돌아간다 */
        emit({ ...snap, state: next, sync: "saving" });
        schedulePut(next);
      } else {
        emit({ ...snap, state: next });
      }
      break;
    case "guest":
      writeLocalJourney(next);
      emit({ ...snap, state: next });
      break;
    default:
      /* 불러오는 중 — 사본에 적지 않고 줄 세운다(loadAccount 가 계정 상태 위에 다시 적용) */
      pendingOps.push(fn);
      emit({ ...snap, state: next });
  }
  return next;
}
