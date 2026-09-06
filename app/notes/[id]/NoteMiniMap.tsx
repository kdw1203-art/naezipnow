"use client";

import Link from "next/link";
import { NaverMap } from "@/components/map/NaverMapLazy";
import type { MapMarkerData } from "@/components/map/NaverMap";
import { Icon } from "@/app/components/Icon";
import { noteMapHref } from "@/lib/notes/note-coords";

/* [967 · 11] 노트 상세 미니맵 — 작성 폼이 metadata.lat/lng 에 남긴 좌표를 작은 지도로.
 *
 * 좌표는 이미 저장돼 있었는데(NoteForm 이 단지 선택·?lat=&lng= 프리필로 채운다)
 * 상세에서는 OG 이미지에만 쓰였다 — 화면에서는 "어디인지" 를 지역 칩 글자로만
 * 읽어야 했다. 사이트의 지도 SDK(네이버, components/map/NaverMap)를 지연 로드하는
 * 래퍼(NaverMapLazy)를 그대로 쓴다 — app/town/LocationMap 은 지역명→구 중심을
 * 찍는 컴포넌트라 정확 좌표를 받지 않아서 재사용하지 않았다.
 *
 * "지도에서 보기" 는 /map?lat=&lng=&z= — app/map/page.tsx 가 실제로 읽는 이름이다
 * (parseCoordFocus 가 lat/lng, `z` 가 줌 6~19. `zoom` 이라는 파라미터는 없다).
 * 좌표 범위(위도 33~39·경도 124~132)도 /map 과 같은 검사를 해서, 지도가 무시할
 * 좌표(0,0 등)에는 미니맵을 그리지 않는다 — 판정·링크 생성은 lib/notes/note-coords
 * (순수 함수, 서버 페이지도 같은 것을 부른다). */

const MINIMAP_LEVEL = 5; // lib/map/naver-maps-sdk: level 5 → 네이버 zoom 16(동네 크기)

export function NoteMiniMap({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  /** 핀 라벨 — 단지명 또는 노트 제목 */
  label: string;
}) {
  const markers: MapMarkerData[] = [
    { id: "note-loc", lat, lng, label: label.slice(0, 20), brandPin: true },
  ];
  const mapHref = noteMapHref({ lat, lng });

  const fallback = (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bg to-line text-center">
      <div className="t-sub font-bold text-text-1">
        <Icon name="pin" size={16} /> {label}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="h-40 overflow-hidden rounded-xl border border-line">
        <NaverMap
          markers={markers}
          center={{ lat, lng }}
          level={MINIMAP_LEVEL}
          showControls={false}
          rounded={false}
          className="h-full w-full"
          fallback={fallback}
        />
      </div>
      <Link
        href={mapHref}
        className="inline-flex w-fit items-center gap-1 t-sub font-bold text-primary no-underline"
      >
        <Icon name="map" size={13} />
        지도에서 보기 ›
      </Link>
    </div>
  );
}
