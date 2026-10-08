/* [999] 운영 경보 접기 — 순수(server-only 없음, 단위테스트 대상). 설명은 health-alerts.ts.
 *
 * [1045] 회복 기록(ok)을 읽는다.
 * 999 의 규칙은 "울린 것만 쌓이고 그친 것은 안 쌓인다"는 전제에서 나왔다 — 마지막 발생이 검사 주기 안이면 진행 중.
 * 그 뒤 점검들이 조건이 풀리면 **ok 한 줄**을 남기기 시작했다(#sig:…|sev=ok). 그런데 이 접기는 ok 를 "ok 라는 경보"로
 * 세어 판에 올리고, 같은 검사의 critical 은 그대로 진행 중으로 뒀다. 2026-10-07 소유자 화면: seo.loc_drift 가
 * 07:35 critical → 07:42 ok 인데 배너는 "심각 경보 3건 진행 중 … seo.loc_drift".
 *  · 같은 검사 · 같은 대상(서명에서 심각도·수치를 뺀 열쇠)의 **더 새로운 ok** 가 있으면 그 경보는 해소다(회복 확인).
 *  · ok 줄은 경보로 세지 않는다 — 판에 따로 오르지 않는다.
 *  · 서명이 있는 경보는 대상 단위로 접는다. seo.sitemap_source 의 "죽은 원천"과 "lastmod 사라짐"은 다른 문제인데
 *    한 줄 "2회"로 뭉쳐 하나만 보였다.
 *  · 서명이 없는 경보(seo.asset 등)는 예전대로 검사|심각도 단위, 시간 창으로만 가른다(회복 기록을 남기지 않는 검사). */

export interface HealthAlertRow {
  checkName: string;
  severity: "critical" | "warn" | string;
  detail: string | null;
  ageHours: number | null;
  checkedAt: string;
  /** 같은 묶음이 이 기간에 몇 번 울렸는지(ok 줄은 세지 않는다) */
  count: number;
  /** [999] 마지막 발생(= checkedAt) 기준으로 아직 울리고 있는지 · [1045] 뒤따른 ok 가 있으면 거짓 */
  active: boolean;
  /** [999] 마지막 발생으로부터 지난 시간 */
  sinceLastHours: number;
  /** [999] 첫 발생 시각(이 기간 안) */
  firstAt: string;
  /** [1045] 이 경보 뒤에 같은 대상의 회복 기록(ok)이 남은 시각 — 없으면 null */
  recoveredAt: string | null;
  /** [1045] 같은 검사의 다른 문제와 가르는 대상 열쇠(서명에서 심각도·수치를 뺀 것). 서명이 없으면 "" */
  target: string;
}

/** [999] 발생 간격(시간)에서 "진행 중" 판정 창을 고른다 — 순수. */
export function activeWindowHours(gapsHours: readonly number[]): number {
  const positive = gapsHours.filter((g) => Number.isFinite(g) && g > 0);
  if (positive.length === 0) return 27; // 1건뿐이면 일 단위 검사로 본다(보수적)
  const minGap = Math.min(...positive);
  return minGap <= 2 ? 3 : 27;
}

/** 발생마다 달라지는 토막 — 심각도와 내용 해시. 값이 숫자인 토막(건수 · 비율 · 감소율)도 대상이 아니다. */
const VOLATILE_KEYS = new Set(["sev", "h"]);
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

/**
 * [1045] 경보 대상 열쇠 — detail 끝의 `#sig:…` 에서 **무엇에 대한 경보인가**만 남긴다(운영 기록 실측 꼴).
 *   "#sig:smsrc|t=/sitemap-redevelopment.xml|k=dead_source|sev=critical"       → "smsrc|t=/sitemap-redevelopment.xml|k=dead_source"
 *   "#sig:path=/sitemap-complexes.xml|sev=ok|drop=0.0"                          → "path=/sitemap-complexes.xml"
 *   "#sig:sm=/sitemap-complexes.xml|lost=9688|roll=0|sev=critical|h=3f9b7c60"   → "sm=/sitemap-complexes.xml"
 *   "#sig:unsub|kind=ix|n=6|h=d673b210|sev=warn"                                → "unsub|kind=ix"
 *   "#sig:etltr|sev=warn|src=molit"                                             → "etltr|src=molit"
 * 빼는 토막은 심각도(sev) · 해시(h) · 값이 숫자인 것뿐이다. 모르는 토막은 **남긴다** — 잘못 남기면 묶음이 잘게 갈릴 뿐이지만,
 * 잘못 빼면 다른 대상의 회복 기록이 울리고 있는 경보를 닫는다. 서명이 없으면 "".
 */
export function alertTargetKey(detail: string | null | undefined): string {
  const m = /#sig:(\S+)/.exec(detail ?? "");
  if (!m) return "";
  return m[1]
    .split("|")
    .filter((tok) => {
      if (!tok) return false;
      const eq = tok.indexOf("=");
      if (eq < 0) return true;
      return !VOLATILE_KEYS.has(tok.slice(0, eq)) && !NUMERIC_RE.test(tok.slice(eq + 1));
    })
    .join("|");
}

/**
 * 회복 기록(ok)의 대상이 경보의 대상을 덮는가 — 같거나, ok 쪽이 앞토막만 가진 더 넓은 대상일 때.
 * app.etl_troubled 의 ok 는 "#sig:etltr|sev=ok"(미해결 소스가 하나도 없다)라 "etltr|src=molit" 경보를 닫는다.
 * 거꾸로는 아니다 — 좁은 대상의 ok 가 넓은 대상의 경보를 닫지 않는다.
 */
export function okCovers(okTarget: string, alertTarget: string): boolean {
  if (!okTarget || !alertTarget) return false;
  return alertTarget === okTarget || alertTarget.startsWith(`${okTarget}|`);
}

const isOk = (sev: string) => sev === "ok";

/** [999] 접기 — 순수(테스트 가능). rows 는 checked_at 내림차순이어야 한다. */
export function foldHealthAlerts(
  rows: ReadonlyArray<Record<string, unknown>>,
  now: Date = new Date(),
  limit = 12,
): HealthAlertRow[] {
  type Acc = HealthAlertRow & { times: number[] };
  const folded = new Map<string, Acc>();
  /** 검사별 회복 기록(대상 · 시각) — rows 가 최신 순이라 대상마다 처음 만난 것이 가장 최근이다 */
  const oks = new Map<string, Array<{ target: string; t: number; at: string }>>();

  for (const r of rows) {
    const check = String(r.check_name ?? "");
    const sev = String(r.severity ?? "warn");
    const detail = r.detail == null ? null : String(r.detail);
    const target = alertTargetKey(detail);
    const at = String(r.checked_at ?? "");
    const t = Date.parse(at);

    if (isOk(sev)) {
      /* 서명 없는 ok 는 무엇을 닫는지 알 수 없다 — 아무것도 닫지 않는다(그리고 경보로도 세지 않는다) */
      if (target && Number.isFinite(t)) {
        const list = oks.get(check) ?? [];
        if (!list.some((o) => o.target === target)) list.push({ target, t, at });
        oks.set(check, list);
      }
      continue;
    }

    /* 서명이 있으면 대상 단위(심각도가 warn → critical 로 올라가도 같은 문제다), 없으면 예전대로 검사|심각도 */
    const key = target ? `${check}|#${target}` : `${check}|${sev}`;
    const prev = folded.get(key);
    if (prev) {
      prev.count += 1;
      prev.firstAt = at;
      if (Number.isFinite(t)) prev.times.push(t);
      continue;
    }
    folded.set(key, {
      checkName: check,
      severity: sev,
      detail,
      ageHours: r.age_hours == null ? null : Number(r.age_hours),
      checkedAt: at,
      firstAt: at,
      count: 1,
      active: false,
      sinceLastHours: 0,
      recoveredAt: null,
      target,
      times: Number.isFinite(t) ? [t] : [],
    });
  }

  const nowMs = now.getTime();
  const out: HealthAlertRow[] = [];
  for (const a of folded.values()) {
    const times = a.times.sort((x, y) => y - x); // 최신 → 과거
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i += 1) gaps.push((times[i - 1] - times[i]) / 3_600_000);
    const last = times[0];
    const since = Number.isFinite(last) ? Math.max(0, (nowMs - last) / 3_600_000) : Infinity;
    /* 회복 기록 — 이 경보의 마지막 발생보다 **뒤**에 남은, 이 대상을 덮는 ok(여럿이면 가장 최근) */
    const ok = (oks.get(a.checkName) ?? [])
      .filter((o) => okCovers(o.target, a.target) && Number.isFinite(last) && o.t > last)
      .sort((x, y) => y.t - x.t)[0];
    const recovered = ok ? ok.at : null;
    const { times: _t, ...row } = a;
    void _t;
    out.push({
      ...row,
      sinceLastHours: Number.isFinite(since) ? Math.round(since * 10) / 10 : 9999,
      recoveredAt: recovered,
      active: !recovered && since <= activeWindowHours(gaps),
    });
  }
  const rank = (s: string) => (s === "critical" ? 0 : s === "warn" ? 1 : 2);
  return out
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        rank(a.severity) - rank(b.severity) ||
        a.sinceLastHours - b.sinceLastHours ||
        b.count - a.count,
    )
    .slice(0, limit);
}

/**
 * [1045] 배너에 적을 검사 이름 — 같은 검사에 문제가 여럿이면 이름 한 번 + 건수("seo.sitemap_source(2)").
 * 순서는 들어온 순서(= 접기 정렬) 그대로.
 */
export function criticalAlertNames(alerts: ReadonlyArray<Pick<HealthAlertRow, "checkName">>): string[] {
  const n = new Map<string, number>();
  for (const a of alerts) n.set(a.checkName, (n.get(a.checkName) ?? 0) + 1);
  return [...n.entries()].map(([name, c]) => (c > 1 ? `${name}(${c})` : name));
}
