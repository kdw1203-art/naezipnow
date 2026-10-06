import { loadSourceFreshness } from "@/lib/admin/source-freshness";
import { loadNewsRegionLinkage } from "@/lib/admin/news-region-link";
import { loadGeocodeCoverage, loadIngestLogSummary24h } from "@/lib/admin/data-health-extras";

/* [개선 #24] 데이터 신선도 대시보드 — 소스별 마지막 적재와 임계.
   입주물량 한 달 정지를 아무도 몰랐던 사각지대의 해소 화면. 판정은
   lib/admin/data-freshness 단일층 — /api/cron/freshness-watch 감시와 동일. */

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  if (!iso) return "확인 불가";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function age(h: number | null): string {
  if (h === null) return "—";
  if (h < 48) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export default async function AdminFreshnessPage() {
  const [rows, linkage, geocode, ingestLog] = await Promise.all([
    loadSourceFreshness(),
    loadNewsRegionLinkage(),
    loadGeocodeCoverage(),
    loadIngestLogSummary24h(),
  ]);
  const staleCount = rows.filter((r) => r.stale).length;
  const linkPct =
    linkage && linkage.total > 0 ? Math.round((linkage.linked / linkage.total) * 100) : null;

  return (
    /* [1040 · 관리 화면] 이 화면은 밝은 테마 토큰(text-ink · .card)으로 짜였는데 관리 틀은 어두운 바탕이라 제목·설명이 바탕에 묻혀 안 보였다(실측 캡처). 화면 전체를 밝은 종이(bg-bg) 한 장 위에 올린다 — 글자색을 하나하나 바꾸지 않고 설계된 테마 그대로 읽힌다. */
    <div className="flex flex-col gap-4 rounded-2xl bg-bg p-4 md:p-5">
      <div>
        <h1 className="text-[19px] font-bold text-ink">데이터 신선도</h1>
        <p className="mt-1 text-[13px] text-text-2">
          소스별 마지막 적재 시각 — 임계를 넘기면 freshness-watch 크론(매일)이 오류
          로그로 승격합니다.{" "}
          {staleCount > 0 ? (
            <b className="text-danger">지금 {staleCount}개 소스가 임계 초과.</b>
          ) : (
            <b className="text-success">전 소스 정상.</b>
          )}
        </p>
      </div>

      <div className="card overflow-x-auto rounded-2xl px-4 py-2">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-text-3">
              <th className="py-2 pr-3 font-semibold">소스</th>
              <th className="py-2 pr-3 font-semibold">마지막 적재</th>
              <th className="py-2 pr-3 font-semibold">경과</th>
              <th className="py-2 pr-3 font-semibold">임계</th>
              <th className="py-2 font-semibold">갱신 경로</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[#f0f3f8] last:border-0">
                <td className="py-2.5 pr-3">
                  <span
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                      r.stale ? "bg-danger" : "bg-success"
                    }`}
                  />
                  <span className="font-bold text-ink">{r.label}</span>
                </td>
                <td className="py-2.5 pr-3 tabular-nums text-text-1">{fmt(r.lastAt)}</td>
                <td className={`py-2.5 pr-3 font-bold ${r.stale ? "text-danger" : "text-text-1"}`}>
                  {age(r.ageHours)}
                </td>
                <td className="py-2.5 pr-3 text-text-3">
                  {r.thresholdHours >= 48 ? `${Math.round(r.thresholdHours / 24)}일` : `${r.thresholdHours}시간`}
                </td>
                <td className="py-2.5 text-[12px] leading-[1.5] text-text-3">{r.pipeline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* [개선 #19 · 1040] 뉴스→지역 연결 — 자동수집 글이 시·군·구 허브로 풀리는 수.
          1040: region 열(시·도)만 대조하던 것을 뉴스 상세와 같은 해석기(geo·태그·제목)로 바꿨다.
          시·도만 있는 기사 · 지역 표기가 없는 기사는 허브가 시·군·구 단위라 연결 대상이 아니다 — 실패로 세지 않고 따로 적는다. */}
      {linkage && linkPct !== null && (
        <div className="card rounded-2xl px-4 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[13px] font-bold text-ink">뉴스→지역 연결률</span>
            <span className="text-[19px] font-bold tabular-nums text-ink">{linkPct}%</span>
            <span className="text-[12px] text-text-3">
              자동수집 {linkage.total.toLocaleString("ko-KR")}건 중{" "}
              {linkage.linked.toLocaleString("ko-KR")}건 시·군·구 허브 연결
            </span>
          </div>
          {/* 한눈 막대 — 연결 · 시·도만 · 지역 없음 */}
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-divider" role="img" aria-label="뉴스 지역 구성">
            <span className="bg-primary" style={{ width: `${(linkage.linked / linkage.total) * 100}%` }} />
            <span className="bg-text-3" style={{ width: `${(linkage.sidoOnly / linkage.total) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] leading-[1.7] text-text-3 tabular-nums">
            시·도만 {linkage.sidoOnly.toLocaleString("ko-KR")}건 · 지역 표기 없음{" "}
            {linkage.noRegion.toLocaleString("ko-KR")}건 — 허브가 시·군·구 단위라 연결 대상 아님
          </p>
          <p className="text-[12px] leading-[1.7] text-text-3 tabular-nums">
            읽은 자리: 수집 값 {linkage.via.region.toLocaleString("ko-KR")} · 시군구{" "}
            {linkage.via.sigungu.toLocaleString("ko-KR")} · 장소 {linkage.via.place.toLocaleString("ko-KR")} · 태그{" "}
            {linkage.via.tag.toLocaleString("ko-KR")} · 제목 {linkage.via.title.toLocaleString("ko-KR")}
          </p>
        </div>
      )}

      {/* [#97] 지오코딩 커버리지 + 최근 24h 수집 로그 — 신선도와 같은 화면에서 본다 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {geocode && (
          <div className="card rounded-2xl px-4 py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[13px] font-bold text-ink">지오코딩 커버리지</span>
              <span
                className={`text-[19px] font-bold tabular-nums ${
                  geocode.pct >= 95 ? "text-success" : geocode.pct >= 70 ? "text-ink" : "text-danger"
                }`}
              >
                {geocode.pct}%
              </span>
              <span className="text-[12px] text-text-3">
                단지 {geocode.complexes.toLocaleString("ko-KR")}개 중{" "}
                {geocode.geocoded.toLocaleString("ko-KR")}개 좌표 확보 — 지도에 찍을 수 있는 비율
              </span>
            </div>
          </div>
        )}
        {ingestLog && ingestLog.length > 0 && (
          <div className="card rounded-2xl px-4 py-3.5">
            <div className="text-[13px] font-bold text-ink">최근 24시간 수집 로그</div>
            <div className="mt-2 flex flex-col gap-1">
              {ingestLog.slice(0, 8).map((r) => (
                <div key={r.source} className="flex items-center gap-2 text-[12px]">
                  <span className="w-24 shrink-0 font-bold text-ink">{r.source}</span>
                  <span className="text-success">ok {r.ok}</span>
                  <span className="text-text-3">skip {r.skipped}</span>
                  <span className={r.error > 0 ? "font-bold text-danger" : "text-text-3"}>
                    err {r.error}
                  </span>
                  {r.error > 0 && r.lastMessage && (
                    <span className="min-w-0 truncate text-[10px] text-text-3">{r.lastMessage}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[12px] leading-[1.7] text-text-3">
        빨간 소스를 발견하면: 갱신 경로 열의 크론·워크플로를 먼저 확인하고, 키 미설정
        (서울 조서 SEOUL_DATA_API_KEY 등)이면 키 발급이 해법입니다. 이 표는 요청 시점
        실측이라 새로고침이 곧 재검사예요.
      </p>
    </div>
  );
}
