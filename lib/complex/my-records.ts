/**
 * [967 · 15] 단지 허브 "내 기록" 탭 — API 계약 타입과 순수 헬퍼.
 *
 * 라우트(app/api/me/complex-records)와 클라이언트(app/complex/[id]/MyRecordsTab.tsx)
 * 가 같은 타입을 보게 하려고 의존성 없는 파일에 둔다. 라우트 파일을 클라이언트가
 * import 하면(타입뿐이라도) 서버 전용 모듈이 번들 경계에 걸리기 쉽다.
 */

/** 탭 카드 한 장에 필요한 만큼만 — 노트 본문·사진·AI 분석은 내보내지 않는다 */
export interface ComplexRecordNote {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  visitDate: string;
  /** 입력된 축(>0)만의 평균(소수 1자리) — 축이 하나도 없으면 null */
  avgScore: number | null;
  isPublic: boolean;
  updatedAt: string;
}

export interface ComplexRecordsResponse {
  /** 방문일 오름차순(회차 순) */
  notes: ComplexRecordNote[];
  /** 관심 단지 여부 — 조회 실패면 null(false 와 구분) */
  watching: boolean | null;
}

/** 로그인 뒤 이 화면(내 기록 탭)으로 돌아오는 주소 */
export function recordsLoginHref(pathname: string, search = ""): string {
  const back = `${pathname || "/"}${search}`;
  return `/login?callbackUrl=${encodeURIComponent(back)}`;
}

/** "2026-07-03" → "2026.07.03" (형식이 아니면 원문) */
export function formatVisitDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

/** 회차 라벨 — 같은 단지 노트를 방문일 순으로 "1회차·2회차…" */
export function visitOrdinal(index: number): string {
  return `${index + 1}회차`;
}
