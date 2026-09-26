/**
 * [1009 · T 리뷰] 비교함에서 뺀 한 칸을 **원래 자리**로 되돌린다 — 예전 "되돌리기"는 맨 뒤에 붙였다.
 * 저장소(components/listing-compare-store — 모듈 싱글턴)에 끼워 넣기가 없어, 그 자리부터 뒤 칸들을 뺐다가
 * 되돌릴 칸 → 뒤 칸 순서로 다시 담는다(담긴 순서 = 목록 순서). 클라이언트 컴포넌트에서만 부른다.
 * 가득 차 있으면(그 사이 다른 매물을 담음) false.
 */
import { MAX_COMPARE, add, getSnapshot, remove, type CompareListing } from "@/components/listing-compare-store";

export function restoreListingAt(item: CompareListing, index: number): boolean {
  const now = getSnapshot();
  if (now.some((i) => i.id === item.id)) return true;
  if (now.length >= MAX_COMPARE) return false; // 뒤 칸을 뺐다 넣는 사이 한 칸이 밀려나지 않게 — 먼저 거절
  const at = Math.max(0, Math.min(index, now.length));
  const tail = now.slice(at);
  for (const t of tail) remove(t.id);
  const ok = add(item);
  for (const t of tail) add(t);
  return ok;
}
