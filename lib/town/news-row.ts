/**
 * [1006] 뉴스룸 행(row) DTO 와 페이지 상수 — 의존성 0 인 타입 모듈.
 *
 * 클라이언트(app/town/news/NewsListClient)는 이 파일만 import 한다. 조립기(lib/town/news-list —
 * 클러스터링·SEO 메타 파서)를 클라이언트 번들로 끌고 가지 않기 위해서다.
 */

/** 첫 장(서버 렌더) 행 수 — 예전 클러스터 상한(60)보다 작다: 행 목록은 카드보다 촘촘해 40이면 한 화면을 넘긴다 */
export const NEWS_LIST_FIRST_PAGE = 40;
/** "더 보기" 한 번에 붙는 행 수 */
export const NEWS_LIST_PAGE = 30;

export type NewsRelated = { id: string; title: string; source: string; timeLabel: string };

export type NewsRow = {
  id: string;
  title: string;
  /** 요약 한 줄 — 우리 요약(meta_description·summary 첫 문장) 없으면 본문 앞부분. 없으면 null */
  summary: string | null;
  category: string;
  city: string;
  source: string;
  /** 표시 시각(ISO) — source_published_at 없으면 created_at */
  publishedAt: string;
  /** 서버에서 계산한 상대 시각 — ISR 주기만큼 낡을 수 있다 */
  timeLabel: string;
  host: string | null;
  /** 원문 주소 — 있을 때만 외부 링크 아이콘을 그린다 */
  sourceUrl: string | null;
  /** 실제 이미지 URL 이 있을 때만 — 없으면 <img> 자체를 그리지 않는다 */
  image: string | null;
  /** [#67] 같은 사건을 다룬 다른 매체 보도(최대 4건) */
  related: NewsRelated[];
};

export type NewsCategoryTab = { label: string; count: number };
