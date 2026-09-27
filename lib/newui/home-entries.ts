/**
 * [1012 · 규칙 7 · 채점 A] 홈 검색 아래 "실데이터 입구 목록"의 재료 — 순수 함수(server-only · JSX 없음).
 *
 * 왜 따로인가: 화면(app/components/home/HomeEntryList.tsx)은 JSX 라 node:test 가 그대로 못 부른다. 값의 유무에
 * 따라 행이 **빠지는지**(지어낸 수·"—" 채움 없음)를 테스트가 재야 하므로 계산만 여기 둔다
 * (lib/newui/home-region-fallback 과 같은 이유).
 *
 * [v4 · 한 화면 한 가지] 행 = 왼쪽 이름(굵게) + 보조 한 줄 / 오른쪽 숫자(`value`). 예전 라벨은 이름과 숫자를 한 문장에
 * 붙여("강남구 7월 거래 1,204건") 숫자 열이 들쭉날쭉했다 — 이제 숫자는 오른쪽 한 열에 선다(행과 열을 맞춘다).
 * [v4 · 규칙 8 "같은 사실은 한 화면에 한 번"] 지역 거래 행·공개 노트 행을 뺐다 — 바로 아래 "공개 임장노트"·"지역 동향"
 * 섹션이 같은 숫자(노트 N편 · 강남구 거래 N건)를 다시 말했다. 그 자리에는 걷힌 회전 배너("오늘의 한 줄")와 네이비
 * AI 입구 패널에만 있던 사실 — 기준금리·주담대(→ 시나리오 계산, 분석 허브에서 빠진 화면의 홈 입구) · AI 단지 분석 —
 * 을 행으로 옮겼다.
 *
 * 규칙:
 *   · 숫자는 홈이 이미 읽는 값만(loadNewHomeData · loadHomeCoverage · loadLatestTemperatures · getBaseRate). 새 조회 없음.
 *   · 값이 없으면 그 행을 뺀다. 보조 줄 = 출처·시점·곁값 한 조각 — 폰 한 줄(≈26자) 안.
 *   · 순서 = 실거래 커버리지 → 시장 온도 → 기준금리 → AI 단지 분석. 최대 4행.
 */
import type { HomeCoverage } from "@/lib/newui/home-coverage";
import type { KpiTemp } from "@/app/components/home/HomeKpiRow";

export interface HomeEntry {
  key: "coverage" | "temp" | "rate" | "ai";
  /** 왼쪽 굵은 이름 — 명사 (예: "국토교통부 실거래") */
  label: string;
  /** 오른쪽 숫자 (예: "783,748건") */
  value: string;
  /** 출처·시점·곁값 한 줄 (예: "전국 218개 시군구 · 단지 21,309곳 · 해제 제외") */
  meta: string;
  href: string;
}

export const HOME_ENTRY_MAX = 4;

/** "783,748" 처럼 세 자리 콤마 — 만 단위 축약 없음(정확한 수가 신뢰다). home-coverage.formatCount 와 같은 규칙 */
const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 금감원 공시 기준시점 "2026-08" → "2026.08" · 형식이 아니면 null */
function asOfLabel(ym: string | null | undefined): string | null {
  const m = /^(\d{4})-?(\d{2})$/.exec(String(ym ?? "").trim());
  return m ? `${m[1]}.${m[2]}` : null;
}

export function buildHomeEntries({
  coverage,
  temp,
  baseRate = null,
  loanRate = null,
  loanRateAsOf = null,
  aiTools = 0,
}: {
  coverage: HomeCoverage;
  temp: KpiTemp | null;
  /** 한국은행 기준금리 라벨(예: "2.50%") — 미연동이면 null(행 없음) */
  baseRate?: string | null;
  /** 은행권 주담대 변동금리 하단(예: "3.62%") — 실공시일 때만 */
  loanRate?: string | null;
  /** 위 금리의 공시 기준시점("YYYY-MM") */
  loanRateAsOf?: string | null;
  /** AI 단지 분석 도구 수(lib/ai/ai-tools AI_TOOL_IDS 길이) — 0 이면 행 없음 */
  aiTools?: number;
}): HomeEntry[] {
  const out: HomeEntry[] = [];

  if (coverage.txCount) {
    const parts: string[] = [];
    if (coverage.regionCount) parts.push(`전국 ${fmt(coverage.regionCount)}개 시군구`);
    if (coverage.complexCount) parts.push(`단지 ${fmt(coverage.complexCount)}곳`);
    out.push({
      key: "coverage",
      label: "국토교통부 실거래",
      value: `${fmt(coverage.txCount)}건`,
      /* "해제 건 제외"는 페이지 끝 데이터 출처가 말한다 — 보조 줄은 폰 한 줄 */
      meta: parts.length ? parts.join(" · ") : "신고분 기준",
      href: "/tx",
    });
  }

  if (temp) {
    out.push({
      key: "temp",
      label: "이번 주 시장 온도",
      value: `${temp.score}점`,
      meta: [temp.regionLabel?.trim() || null, temp.weekLabel, temp.headline].filter(Boolean).join(" · "),
      href: "/analysis/temperature",
    });
  }

  if (baseRate && baseRate !== "—") {
    const asOf = asOfLabel(loanRateAsOf);
    out.push({
      key: "rate",
      label: "기준금리",
      value: baseRate,
      /* 주담대는 월 공시라 기준금리(일 단위)와 시점이 다르다 — 공시 달을 붙인다(home-data loanRateAsOf 주석).
         "공시"라는 낱말은 페이지 끝 데이터 출처가 말한다 — 보조 줄은 폰 한 줄 */
      meta: loanRate ? `주담대 변동 ${loanRate}부터${asOf ? ` · ${asOf}` : ""}` : "한국은행",
      href: "/analysis/scenario",
    });
  }

  if (aiTools > 0) {
    out.push({
      key: "ai",
      label: "AI 단지 분석",
      value: `${aiTools}종`,
      meta: "국토교통부 실거래·한국부동산원 통계 기준",
      href: "/analysis",
    });
  }

  return out.slice(0, HOME_ENTRY_MAX);
}
