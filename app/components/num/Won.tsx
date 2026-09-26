import { eokManParts } from "@/lib/format/eok-man";

/* [1009] 큰 가격 숫자 — "12억 4,500만원" 을 숫자는 굵고 크게, 단위(억·만원)는 작고 옅게.
 *
 * 왜(토스뱅크·토스증권·네이버 부동산 공통): 가격이 화면의 주인공인 자리에서 눈이 먼저 읽어야 하는 건
 * 숫자다. 단위까지 같은 굵기·크기면 "12억4,500만원" 이 한 덩어리로 보여 자릿수를 세게 된다.
 * 서버 컴포넌트(훅 없음) — 어디서든 쓴다. 값은 **만원** 정수(국토부 신고 단위).
 *
 *   <Won manwon={124500} />                 12억 4,500만원 (단위 작게)
 *   <Won manwon={124500} unit="만" />       12억 4,500만   (원 생략 — 목록·표)
 *   <Won manwon={null} />                    —
 * 크기는 부모 글자 크기를 따른다(className 에 t-display·t-title 등을 준다). 단위는 0.72em.
 */
export function Won({
  manwon,
  unit = "만원",
  empty = "—",
  className,
  unitClassName,
}: {
  manwon: number | null | undefined;
  unit?: "만원" | "만";
  empty?: string;
  className?: string;
  unitClassName?: string;
}) {
  const p = eokManParts(manwon);
  const u = `won-u ${unitClassName ?? ""}`;
  if (!p) return <span className={`t-num ${className ?? ""}`}>{empty}</span>;
  const won = unit === "만원";
  return (
    <span className={`won t-num ${className ?? ""}`}>
      {p.eok > 0 && (
        <>
          {p.eok.toLocaleString("ko-KR")}
          <span className={u}>억{p.man === 0 && won ? "원" : ""}</span>
        </>
      )}
      {p.man > 0 && (
        <>
          {p.eok > 0 ? " " : ""}
          {p.man.toLocaleString("ko-KR")}
          <span className={u}>{won ? "만원" : "만"}</span>
        </>
      )}
    </span>
  );
}

export default Won;
