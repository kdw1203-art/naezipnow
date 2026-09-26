import type { Metadata } from "next";
import { NoteNewEntry } from "./NoteNewEntry";
import NoteNewLoading from "./loading";

/* 임장노트 작성 — 폼 본체는 NoteForm(클라이언트, /notes/[id]/edit 와 공용).
   ?tpl={id} 템플릿 프리셋 · ?memo= 메모 초안(/calculator) · ?quick=1 퀵모드 ·
   ?intent=ai / ?from=welcome AI 유도 · [995 · 3] ?revisit={noteId} 회차 프리필.

   [1007] **정적 셸**로 전환. 예전엔 위 쿼리를 `searchParams` 로, 회차 프리필의 소유자
   판정을 `safeAuth()`+`getNote()` 로 서버에서 읽어 force-dynamic 이었다. 24h 실측
   함수 호출 1,790회 중 사람 방문은 한 자릿수(7일 페이지뷰 ~120건 전체) — 나머지는
   크롤러가 "노트 쓰기" 링크를 따라온 것이고, 그때마다 함수가 떠서 세션까지 조회했다.
   이제 서버는 loading.tsx 와 같은 골격(NoteNewLoading)만 굳혀 두고, NoteNewEntry
   (클라이언트)가 마운트 뒤 주소·세션·템플릿·이전 노트를 읽어 NoteForm 에 **같은 props**
   를 준다(판정: lib/notes/new-entry · 템플릿: /api/note-templates/{id} · 회차:
   /api/inspection/notes/{id}). 폼은 원래 완전한 클라이언트 컴포넌트라 HTML 이 먼저
   와도 하이드레이션 전엔 쓸 수 없었다 — 첫 화면은 그대로 스켈레톤이고, 기능은 빠진
   것이 없다(비회원 판정은 1005 부터 폼이 스스로 한다: probeGuest). */

export const dynamic = "force-static";

/* N7 — 작성 폼은 색인 대상이 아니다. ?tpl=·?memo= 로 만들어지는 URL 은 특정
   사용자의 일회용 진입 주소이고(메모 초안이 주소에 실리기도 한다), 검색에서
   들어와도 로그인 벽을 만난다. follow 는 남겨 내부 링크는 그대로 타게 둔다. */
export const metadata: Metadata = {
  title: "임장노트 작성 | 내집나우",
  robots: { index: false, follow: true },
};

export default function NoteNewPage() {
  /* 스켈레톤은 서버 컴포넌트(loading.tsx)를 그대로 넘긴다 — 클라이언트 번들에 골격 JSX 를
     싣지 않는다(/notes/new 예산 470KB, 실측 462). */
  return <NoteNewEntry fallback={<NoteNewLoading />} />;
}
