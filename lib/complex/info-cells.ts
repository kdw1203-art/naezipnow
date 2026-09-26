/**
 * [1009 · C] 단지 정보 격자(네이버 부동산 "단지 정보") 칸 — 순수 함수(ComplexInfoGrid 가 그린다, 테스트가 잠근다).
 * 규칙: **데이터에 실제로 있는 항목만** 칸이 된다(없는 칸·"—" 나열 금지). 상수(유형 "아파트" — 실거래 적재가 아파트만
 * 받아 모든 단지가 같은 값)는 데이터가 아니라 칸을 만들지 않는다. 빠진 항목과 이유는 "자료 완성도"가 말한다.
 */
export type ComplexInfoFacts = {
  households: number | null;
  buildingCount: number | null;
  parkingCount: number | null;
  parkingPerHh: number | null;
  heating: string | null;
  builder: string | null;
  buildYear: number | null;
  roadAddress: string | null;
  address: string | null;
  kaptCode: string | null;
};

export type ComplexInfoCell = { label: string; value: string; sub?: string; wide?: boolean };

export function complexInfoCells(f: ComplexInfoFacts, nowYear: number): ComplexInfoCell[] {
  const cells: ComplexInfoCell[] = [];
  if (f.households && f.households > 0) cells.push({ label: "세대수", value: `${f.households.toLocaleString("ko-KR")}세대` });
  if (f.buildingCount && f.buildingCount > 0) {
    cells.push({ label: "동 수", value: `${f.buildingCount.toLocaleString("ko-KR")}개 동` });
  }
  if (f.buildYear) {
    const age = nowYear - f.buildYear;
    cells.push({ label: "준공", value: `${f.buildYear}년`, sub: age >= 0 ? `${age}년차` : undefined });
  }
  if (f.parkingCount && f.parkingCount > 0) {
    cells.push({
      label: "주차",
      value: `${f.parkingCount.toLocaleString("ko-KR")}대`,
      sub: f.parkingPerHh ? `세대당 ${f.parkingPerHh}대` : undefined,
    });
  }
  if (f.heating?.trim()) cells.push({ label: "난방", value: f.heating.trim() });
  if (f.builder?.trim()) {
    const b = f.builder.trim().replace(/,\s*/g, ", ");
    cells.push({ label: "시공사", value: b, wide: b.length > 10 });
  }
  return cells;
}
