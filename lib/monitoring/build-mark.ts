/**
 * [1027 · 제안 28] 빌드 표식 — "이 화면(또는 이 서버)이 어느 빌드의 것인가"를 한 낱말로.
 *
 * 값은 빌드 때 next.config.ts 가 정해 서버 코드에 박아 둔 커밋 해시 앞 7자(process.env.NZ_BUILD_MARK)다.
 * 루트 레이아웃이 <meta name="nz-build"> 로 HTML 에 심고(그 탭이 받은 빌드), 오류 수신부
 * (/api/monitoring/client-error)가 같은 값을 "지금 서버의 빌드"로 옆에 적는다. 둘이 다르면 배포 뒤에도
 * 옛 화면을 들고 있던 탭이다. 한 배포 안에서는 미리 그린 HTML·요청 때 그린 HTML·수신부가 모두 같은 값이다.
 * 비밀 값이 아니다(커밋 해시 앞자리). 형식이 다르면 빈 문자열 — HTML 에 아무 글자나 싣지 않는다.
 */
export function normalizeBuildMark(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(v) ? v.slice(0, 7).toLowerCase() : "";
}

/** 이 서버 코드가 빌드될 때 박힌 표식(없으면 빈 문자열 — 로컬·해시 없는 빌드) */
export const BUILD_MARK: string = normalizeBuildMark(process.env.NZ_BUILD_MARK);
