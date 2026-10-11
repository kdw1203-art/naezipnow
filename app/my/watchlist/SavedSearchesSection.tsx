import { listSavedSearches } from "@/lib/saved-search/store";
import { scopeActionUrl } from "@/lib/saved-search/alert-matcher";
import { logger } from "@/lib/log";
import { SavedSearchClient, type SavedSearchView } from "./SavedSearchClient";

/* [994] 저장 검색 — /my/watchlist?tab=searches 의 한 탭(옛 /my/saved-searches).
   [1057 · B4] 저장소가 실패를 던진다 — 여기서 받아 "불러오기 실패"로 넘긴다(예전엔 [] 라 "저장한 검색 없음"이 됐다).
   검색을 실행하는 주소(actionUrl)는 알림이 눌렀을 때 가는 곳과 같다(scopeActionUrl — 서버 전용 모듈이라 여기서 붙인다). */
export async function SavedSearchesSection({ email }: { email: string }) {
  let items: SavedSearchView[] = [];
  let failed = false;
  try {
    items = (await listSavedSearches(email)).map((s) => ({ ...s, actionUrl: scopeActionUrl(s.scope, s.query) }));
  } catch (e) {
    logger.error("[my/watchlist] 저장 검색 조회 실패", e);
    failed = true;
  }
  return <SavedSearchClient initial={items} initialFailed={failed} />;
}
