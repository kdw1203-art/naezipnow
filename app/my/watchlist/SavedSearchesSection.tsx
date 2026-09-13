import { listSavedSearches } from "@/lib/saved-search/store";
import { SavedSearchClient } from "./SavedSearchClient";

/* [994] 저장 검색 — /my/watchlist?tab=searches 의 한 탭(옛 /my/saved-searches). */
export async function SavedSearchesSection({ email }: { email: string }) {
  const items = await listSavedSearches(email);
  return <SavedSearchClient initial={items} />;
}
