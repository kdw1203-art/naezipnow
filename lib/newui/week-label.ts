import { kstParts } from "@/lib/format/kst";

/** "9월 2주차" — [995] 주간 다이제스트·개인 다이제스트·뉴스 배지가 같은 라벨을 쓴다.
 *  [1055] 한국 날짜 — 서버(UTC)의 getMonth/getDate 는 매일 00~09시(KST)에 전날이라 월초엔 "9월 5주차"가 됐고 하루 캐시에 남았다.
 *  순수 함수라 next/cache 를 끌지 않는 이 파일에 둔다(단위 시험·개인 다이제스트가 바로 부른다). */
export function weekLabelOf(now: Date): string {
  const p = kstParts(now);
  const month = p ? p.month : now.getUTCMonth() + 1;
  const day = p ? p.day : now.getUTCDate();
  const week = Math.min(Math.ceil(day / 7), 5);
  return `${month}월 ${week}주차`;
}
