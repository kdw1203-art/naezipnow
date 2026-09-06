/**
 * [967] 임장노트 작성 폼의 순수 도우미 — 사진 순서·업로드 병합·진행 문구·방문일.
 *
 * NoteForm.tsx 는 "use client" + next/dynamic 이라 node:test 에서 바로 부를 수
 * 없다. 여기 있는 것은 DOM·React 를 모르는 함수뿐이라 그대로 단위테스트한다.
 * 브라우저 API(XMLHttpRequest·localStorage)는 폼 쪽에 남긴다.
 */

/* ===== [967 · 1·6] 업로드 결과 병합 ===== */

/** 업로드 성공분을 기존 목록 뒤에 붙인다 — 중복 URL 제거, 최대 장수 초과분은 버림.
    실패한 파일이 섞여 있어도 성공분은 잃지 않는다(예전엔 첫 실패에서 전부 유실). */
export function mergeUploadedPhotos(
  existing: readonly string[],
  uploaded: readonly string[],
  max: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [...existing, ...uploaded]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/** "2/5 업로드 중…" — 하나라도 진행 중일 때만. 끝났으면 null. */
export function uploadProgressLabel(done: number, total: number): string | null {
  if (total <= 0 || done >= total) return null;
  return `${done}/${total} 업로드 중…`;
}

/** "3장 중 1장 실패" — 실패가 없으면 null. 숫자는 실제 집계만(지어내지 않는다). */
export function uploadFailureLabel(total: number, failed: number): string | null {
  if (failed <= 0 || total <= 0) return null;
  return `${total}장 중 ${failed}장 실패`;
}

/* ===== [967 · 5] 사진 순서·대표 사진 ===== */

/** 인덱스 from 의 사진을 한 칸 앞(-1)/뒤(+1)로. 끝에서는 그대로 돌려준다. */
export function movePhoto(list: readonly string[], from: number, dir: -1 | 1): string[] {
  const to = from + dir;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** 대표 사진 = photos[0](목록 카드 coverUrl 이 첫 장을 쓴다 — 데이터 모델 변경 없음).
    index 의 사진을 맨 앞으로 옮긴다. */
export function makeCoverPhoto(list: readonly string[], index: number): string[] {
  if (index <= 0 || index >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.unshift(item);
  return out;
}

/* ===== [967 · 6] 제한 동시 실행 ===== */

/** items 를 최대 limit 개씩 동시에 worker 로 처리한다. 결과는 입력 순서대로.
    worker 가 던지면 그 자리만 rejected 로 두지 않고 호출자가 결과 타입으로
    성공/실패를 표현하게 한다(사진 한 장 실패가 나머지를 막지 않도록). */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

/* ===== [967 · 2] 방문일 ===== */

/** 로컬 달력 기준 YYYY-MM-DD. toISOString().slice(0,10) 은 UTC 라 한국 저녁
    (KST 21시 이후)에 하루 전 날짜가 나온다 — 방문일은 로컬 달력이 맞다. */
export function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** EXIF 촬영 시각(ISO, 로컬 가정) → 방문일 후보. 형식이 깨졌거나 오늘보다
    미래(카메라 시계 오류)면 null — 방문일을 거짓 값으로 채우지 않는다. */
export function visitDateFromTakenAt(
  takenAt: string | null | undefined,
  today: string = localDateIso(),
): string | null {
  if (!takenAt) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(takenAt);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (Number.isNaN(Date.parse(date))) return null;
  if (date > today) return null;
  return date;
}
