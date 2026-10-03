import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";
import { priceHighCopy, priorWindowLabel, type PriceHighRow } from "./price-record-copy";

export type { PriceHighRow };

/* [#81] 신고가 자동 소식 — 매일 들어오는 실거래에서 "앞선 최고가(최대 3년)를 3%+ 경신한
 * 당월·전월 계약"을 골라 하루 1건의 자동 글로 발행한다.
 *
 * [1027] 글이 "직전 3년 최고가"라고 적었는데, 우리가 가진 실거래는 3년에 못 미친다
 * (운영 2026-10-03: 매매 계약월 2025.01~ · 이력 채우기 진행 중). RPC 는 "직전 3년"을
 * 훑지만 3년치가 없으면 가진 만큼만 본다 — 그걸 3년이라 적으면 거짓이다. 이제 줄마다
 * **그 단지·면적대 이력이 실제로 시작하는 달**을 읽어 "2025.01 이후 최고"처럼 적고,
 * 이력이 3년을 덮을 때만 "직전 3년"이라 쓴다(priorWindowLabel). 읽지 못하면 "수집 기간".
 *
 * 스팸 방지 3중 장치:
 *  1) RPC 필터(당월·전월 계약 + 사전 이력 10건+ + 3% 마진) — 백필 유입 오탐 차단
 *     (무필터 실측: 하루 933건 "가짜 신고가" → 필터 후 상위 수 건).
 *  2) 하루 최대 1건의 통합 글(개별 단지당 글 금지).
 *  3) external_key(price-high:YYYYMMDD) 멱등 — 크론 중복 실행에도 1건.
 * 사실 규율: 국토부 신고 기준·취소 가능성을 본문에 명기. 수치는 RPC 결과 그대로. */

export type PriceRecordResult = {
  detected: number;
  posted: boolean;
  reason?: string;
  postId?: string;
};

export async function runPriceRecordWatch(): Promise<PriceRecordResult> {
  const sb = getServiceSupabase();
  if (!sb) return { detected: 0, posted: false, reason: "no-service-client" };

  const { data, error } = await sb.rpc("detect_new_price_highs", {
    p_hours: 26,
    p_min_prior: 10,
    p_margin: 1.03,
    p_limit: 5,
  });
  if (error) {
    logger.error("[price-record] RPC 실패", error);
    throw new Error(`detect_new_price_highs 실패: ${error.message}`);
  }
  const rows = (data ?? []) as PriceHighRow[];
  // 단지+면적 중복 제거(같은 날 두 건 경신 시 최고가만)
  const seen = new Set<string>();
  const items = rows.filter((r) => {
    const k = `${r.complex_name}|${r.region_name}|${r.area}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (items.length === 0) return { detected: 0, posted: false, reason: "no-records" };

  const kst = new Date(Date.now() + 9 * 3600_000);
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, "");
  const externalKey = `price-high:${ymd}`;

  // 멱등 — 오늘자 글이 이미 있으면 발행하지 않는다
  const { data: existing, error: exErr } = await sb
    .from("board_posts")
    .select("id")
    .eq("external_key", externalKey)
    .maybeSingle();
  if (exErr) {
    logger.error("[price-record] 기존 글 확인 실패", exErr);
    throw new Error(`board_posts 조회 실패: ${exErr.message}`);
  }
  if (existing) return { detected: items.length, posted: false, reason: "already-posted" };

  // 자동 수집 글의 작성자(봇 프로필)를 실사용 값에서 찾는다 — UUID 하드코딩 금지
  const { data: authorRow, error: authorErr } = await sb
    .from("board_posts")
    .select("author_id")
    .eq("is_automated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (authorErr || !authorRow?.author_id) {
    return { detected: items.length, posted: false, reason: "no-bot-author" };
  }

  const top = items[0];
  /* UTC 로 읽는다 — kst 는 9시간을 더해 둔 시각이라 getMonth()/getDate() 는 서버 시간대에 따라 하루 어긋난다 */
  const dateLabel = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;

  /* [1027] 줄마다 비교 구간 — 그 단지·면적대(±2㎡, RPC 와 같은 묶음) 매매 이력의 첫 달.
     최대 5건이라 조회 5번. 못 읽으면 null → "수집 기간"(지어내지 않는다). */
  const now = new Date();
  const windows = await Promise.all(
    items.map(async (r) => {
      try {
        const { data: first, error: firstErr } = await sb
          .from("market_transactions")
          .select("contract_ym")
          .eq("complex_name", r.complex_name)
          .eq("region_name", r.region_name)
          .eq("transaction_type", "trade")
          .eq("is_cancelled", false)
          .gte("area_m2", r.area - 2.5)
          .lt("area_m2", r.area + 2.5)
          .order("contract_ym", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstErr) {
          logger.warn("[price-record] 비교 구간 조회 실패", { message: firstErr.message });
          return priorWindowLabel(null, now);
        }
        return priorWindowLabel(first?.contract_ym != null ? String(first.contract_ym) : null, now);
      } catch {
        return priorWindowLabel(null, now);
      }
    }),
  );
  const { title, content, aiSummary } = priceHighCopy({ dateLabel, items, windows });

  const { data: inserted, error: insErr } = await sb
    .from("board_posts")
    .insert({
      author_id: authorRow.author_id,
      board_type: "community",
      category: "정보/소식",
      region: regionIdForName(top.region_name) ? top.region_name.split(" ").pop() : null,
      title,
      content,
      tags: ["신고가", "실거래"],
      ai_summary: aiSummary,
      ai_keywords: ["신고가", top.complex_name, top.region_name],
      source_name: "국토교통부 실거래가",
      external_key: externalKey,
      is_automated: true,
      automation_meta: {
        source: "price-record-watch",
        summary_v: "2",
        /* [#114] 대표 단지 24개월 차트 카드 — 목록 썸네일·공유 카드로 쓰인다 */
        image: `https://naezipnow.com/api/og/complex-trend?${new URLSearchParams({
          region: top.region_name,
          name: top.complex_name,
        }).toString()}`,
      },
      is_published: true,
    })
    .select("id")
    .single();
  if (insErr) {
    logger.error("[price-record] 발행 실패", insErr);
    throw new Error(`board_posts 발행 실패: ${insErr.message}`);
  }
  return { detected: items.length, posted: true, postId: String(inserted?.id ?? "") };
}
