/* [967 · 11] 임장노트 좌표 — metadata.lat/lng 판정과 /map 핸드오프 링크. 순수 함수.
 *
 * 범위 검사는 app/map/page.tsx 의 parseCoordFocus 와 같다(위도 33~39 · 경도 124~132).
 * /map 이 무시할 좌표를 "위치 있음" 으로 그리면 미니맵이 바다 한가운데를 보여 준다.
 * 링크 파라미터 이름도 /map 이 실제로 읽는 것(lat · lng · z)만 쓴다 — `zoom` 은 없다. */

export type NoteCoords = { lat: number; lng: number };

/** /map 의 `z` 범위(6~19) 안에서 동네가 보이는 배율 */
export const NOTE_MAP_ZOOM = 16;

export function noteCoordsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): NoteCoords | null {
  const m = metadata ?? {};
  const lat = Number(m.lat ?? m.latitude);
  const lng = Number(m.lng ?? m.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  return { lat, lng };
}

export function noteMapHref(c: NoteCoords, zoom: number = NOTE_MAP_ZOOM): string {
  const z = Math.max(6, Math.min(19, Math.round(zoom)));
  return `/map?${new URLSearchParams({
    lat: String(c.lat),
    lng: String(c.lng),
    z: String(z),
  }).toString()}`;
}
