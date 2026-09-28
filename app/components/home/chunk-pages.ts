/* [1022] 배열을 size 개씩 쪽으로 나눈다(마지막 쪽은 짧을 수 있다). 서버(page.tsx)가 부르므로 "use client" 파일 밖에 둔다 */
export function chunkPages<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
