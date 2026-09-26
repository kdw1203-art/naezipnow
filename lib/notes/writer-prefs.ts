/**
 * [1006] 작성기 기본값 — `GET /api/me/preferences` 응답의 `uiPrefs`(lib/prefs/ui-prefs.ts)에서
 * 임장노트 작성기가 쓰는 세 값만 읽는다. 순수 함수(클라이언트·테스트 공용).
 *
 * 계약(에이전트 C 의 라우트): 응답에 `uiPrefs` 는 **항상** 있고 비로그인이면 DEFAULT_UI_PREFS,
 * `authenticated` 로 세션 유무를 말한다. 작성기는 **로그인 사용자가 설정을 저장한 적이
 * 있을 때만**(updatedAt 이 있을 때) 그 값을 쓴다 — 저장한 적 없는 계정에 스키마 기본값
 * (noteVisibilityDefault "public")을 그대로 적용하면, 설정 화면을 연 적도 없는 사람의
 * 노트가 말없이 공개로 시작한다. 그건 기본값이 아니라 사고다. 비회원·조회 실패·
 * 저장한 적 없음은 전부 null → 작성기는 종전 기본값(비공개 · 목적에서 파생한 역할 · 3단계).
 */
import { normalizeUiPrefs, type InvestorRolePref, type NoteVisibility } from "@/lib/prefs/ui-prefs";

export type WriterPrefs = {
  visibility: NoteVisibility;
  quick: boolean;
  /** null 이면 노트마다(방문 목적에서 파생) */
  investorRole: InvestorRolePref | null;
};

export function readWriterPrefs(json: unknown): WriterPrefs | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { authenticated?: unknown; uiPrefs?: unknown };
  if (o.authenticated !== true) return null;
  if (!o.uiPrefs || typeof o.uiPrefs !== "object") return null;
  const p = normalizeUiPrefs(o.uiPrefs);
  if (!p.updatedAt) return null;
  return {
    visibility: p.noteVisibilityDefault,
    quick: p.noteQuickDefault,
    investorRole: p.investorRoleDefault,
  };
}
