/**
 * 대장 수집이 **어느 시군구를 먼저 훑을지** 정하는 규칙 — 순수 함수.
 *
 * [982] 예전에는 시계로 골랐다: `floor(now/12h) % ceil(total/12)`.
 * 하루 한 번 같은 시각에 도는 크론에서는 이 값이 매일 **2씩** 올라가므로
 * 짝수 슬라이스만 방문하고 홀수 11개(≈132개 시군구)는 **영원히 안 돈다**.
 * 적재 로그가 그대로였다 — 09-06 slice=0 · 09-07 slice=2 · 09-08 slice=4 · 09-09 slice=6.
 *
 * 2026-09-09 실측(source_key='k-apt-basic')이 그 결과다:
 *   대전 44일 · 광주 43일 · 세종 43일 · 인천 34일 · 울산 33일 · 경기 20일 경과
 *   전남(46)은 대장에 한 행도 없음
 *
 * 그래서 순서를 **데이터가** 정하게 한다. 커서 테이블이 필요 없다 — 데이터 자체가
 * 커서다. 실패해서 안 채워진 시군구는 다음 실행에서 다시 1순위가 된다(자기 치유).
 *
 * DB·네트워크를 모르는 파일로 따로 뒀다 — 이 규칙이 정확한지는 브라우저도 서버도
 * 없이 테스트로 고정해야 한다(tests/unit/apt-master-rotation-982.test.ts).
 */

/**
 * 시군구를 "오래 안 본 순"으로 정렬한다.
 *
 * · 대장에 한 행도 없는 시군구는 **맨 앞**(한 번도 못 받았거나 전부 실패)
 * · 그다음은 마지막 갱신이 오래된 순
 * · 동점이면 코드 오름차순 — 순서가 흔들리면 같은 곳만 반복해서 돈다
 */
export function orderSigunguByStaleness(
  all: readonly string[],
  seen: ReadonlyMap<string, number>,
): string[] {
  return [...all].sort((a, b) => {
    const ta = seen.has(a) ? (seen.get(a) as number) : -1;
    const tb = seen.has(b) ? (seen.get(b) as number) : -1;
    return ta === tb ? a.localeCompare(b) : ta - tb;
  });
}
