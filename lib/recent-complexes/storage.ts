/* [1026c · 번들] 최근 본 단지 localStorage 읽기·쓰기 — app/components/RecentComplexes.tsx 에서 떼어 냈다.
   단지 상세(/complex/[id])는 방문 기록(RecentComplexRecorder)만 필요한데, 예전엔 칩 목록·서버 병합·토스트까지 든
   RecentComplexes 모듈 전체가 그 경로 첫 로드에 실렸다(배포 빌드 479KB / 예산 480KB). 두 곳이 이 파일 하나를 본다. */
import { dedupeRecents } from "@/lib/recent-complexes/dedupe";

export const RECENT_KEY = "nz_recent_complexes";
export const RECENT_MAX = 8;

export interface RecentComplex {
  id: string;
  name: string;
  region?: string;
  /** 마지막 방문 시각 (epoch ms) */
  at: number;
}

export function readRecents(): RecentComplex[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    /* [1002] 이미 저장된 중복(옛 id·새 id 한 쌍)도 읽는 자리에서 접는다 */
    return dedupeRecents(
      arr.filter(
        (v): v is RecentComplex =>
          !!v &&
          typeof v === "object" &&
          typeof (v as RecentComplex).id === "string" &&
          typeof (v as RecentComplex).name === "string" &&
          typeof (v as RecentComplex).at === "number",
      ),
      RECENT_MAX,
    );
  } catch {
    return []; // 파싱 실패·프라이빗 모드 — 조용히 무시
  }
}

export function writeRecents(list: RecentComplex[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // 저장 불가 환경 — no-op
  }
}
