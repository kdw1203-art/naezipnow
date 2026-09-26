/**
 * [1006 · E] /llms-full.txt 본문 조립 — 순수 함수(서버 로더는 app/llms-full.txt/route.ts).
 *
 * 왜 라우트로 옮겼나: public/llms-full.txt 는 손으로 적은 문서였다. 인용 예문에
 * "집계 지역 61곳·12,345건" 같은 예시 숫자가 박혀 있었고(실데이터가 아니다), 스키마 절은
 * "데이터 페이지: Dataset" 처럼 실제 배선과 다른 서술이 있었다. llms.txt(요약본)는 이미
 * 실데이터 라우트인데 상세본만 정적이라 둘이 어긋날 수 있었다(priority-50 #40·enhance-50
 * #40 이월 항목). 이제 숫자는 전부 요청 시점 집계에서 오고, **못 읽은 숫자는 쓰지 않는다.**
 *
 * 규칙(llms.txt 와 같다):
 *  - 커버리지·월 목록·용어 수는 입력(실데이터)에서만. null 이면 그 문장을 생략한다.
 *  - 문장 속 임계값("거래 10건 이상")은 코드 상수와 같은 값만 적는다(lib/reports/monthly.ts).
 *  - 아직 없는 것은 없다고 적는다.
 */

export interface LlmsFullInput {
  /** 지역 랜딩 수·단지 허브 수 — 못 읽었으면 null(문장 생략) */
  coverage: { regions: number | null; complexes: number | null };
  /** 동네 홈(카탈로그) — 정적 모듈이라 항상 있다 */
  towns: Array<{ id: string; name: string; city?: string }>;
  /** 월간 리포트가 존재하는 월(최신순). null 이면 조회 실패(목록 생략, 실패라고 적는다) */
  reportMonths: Array<{ ym: string; regionCount: number; txCount: number; updatedAt: string | null }> | null;
  /** 용어사전 — 정적 모듈 */
  glossary: Array<{ slug: string; term: string; short: string; category: string }>;
  /** 시장 온도 시계열이 있는 지역 수 — 정적 목록 */
  temperatureRegionCount: number;
  /** 운영 주체 — 단일 출처(lib/brand/business-info) */
  business: { legalName: string; representative: string; registrationNumber: string; supportEmail: string };
}

const SITE = "https://naezipnow.com";

function ymLabel(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;
}

function ko(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function buildLlmsFullDoc(input: LlmsFullInput): string {
  const { coverage, towns, reportMonths, glossary, business } = input;

  /* ── 커버리지 문장: 있는 숫자만 ── */
  const coverageLines: string[] = [];
  if (coverage.regions !== null) {
    coverageLines.push(`- 지역 랜딩(/region/{id}, 한국부동산원 지역 통계가 있는 지역): ${ko(coverage.regions)}개`);
  }
  if (coverage.complexes !== null) {
    coverageLines.push(`- 단지 허브(/complex/{id}, 실거래 1건 이상): ${ko(coverage.complexes)}개`);
  }
  coverageLines.push(`- 동네 홈(/town/{id}): ${ko(towns.length)}개`);
  coverageLines.push(`- 시장 온도 주간 시계열(/analysis/temperature/{id}): ${ko(input.temperatureRegionCount)}개 지역`);
  coverageLines.push(`- 용어사전(/glossary/{slug}): ${ko(glossary.length)}개 용어`);

  /* ── 월간 리포트: 실제 존재하는 달만 ── */
  let reportBlock: string;
  if (reportMonths === null) {
    reportBlock =
      "이 문서를 만드는 시점에 월 목록을 읽지 못했습니다. 목록은 https://naezipnow.com/reports 와 " +
      "https://naezipnow.com/api/public/v1/months 에서 확인하세요(조회 실패이지 리포트가 없다는 뜻이 아닙니다).";
  } else if (reportMonths.length === 0) {
    reportBlock = "아직 집계가 존재하는 달이 없습니다.";
  } else {
    const latest = reportMonths[0];
    const shown = reportMonths.slice(0, 12);
    reportBlock =
      `존재하는 달: ${reportMonths.length}개월(최신 ${ymLabel(latest.ym)}). 최근 12개월까지 아래에 적습니다 — ` +
      "값은 이 문서를 만든 시점의 집계이며, 최근 두 달은 신고 지연으로 더 늘어납니다(잠정치).\n" +
      shown
        .map(
          (m) =>
            `- ${ymLabel(m.ym)}: 집계 지역 ${ko(m.regionCount)}곳 · 아파트 매매 신고 ${ko(m.txCount)}건 — ${SITE}/reports/${m.ym}` +
            (m.updatedAt ? ` (집계 갱신 ${m.updatedAt.slice(0, 10)})` : ""),
        )
        .join("\n") +
      `\n- 인용 예(최신 달 실제 값): "내집나우(naezipnow.com) 집계에 따르면, ${ymLabel(latest.ym)} 집계 지역 ${ko(
        latest.regionCount,
      )}곳의 아파트 매매 실거래 신고는 ${ko(latest.txCount)}건이다 (국토교통부 실거래 신고 기반, 잠정치일 수 있음)."`;
  }

  /* ── 지역 허브 목록: 카탈로그 그대로(시/도별) ── */
  const byCity = new Map<string, Array<{ id: string; name: string }>>();
  for (const t of towns) {
    const city = t.city ?? "서울";
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city)!.push({ id: t.id, name: t.name });
  }
  const regionList = [...byCity.entries()]
    .map(
      ([city, rows]) =>
        `- ${city}: ` + rows.map((r) => `${r.name}(${SITE}/region/${r.id})`).join(" · "),
    )
    .join("\n");

  /* ── 용어사전: 전부 (정의 1문장) ── */
  const byCat = new Map<string, Array<{ slug: string; term: string; short: string }>>();
  for (const g of glossary) {
    if (!byCat.has(g.category)) byCat.set(g.category, []);
    byCat.get(g.category)!.push(g);
  }
  const glossaryList = [...byCat.entries()]
    .map(
      ([cat, rows]) =>
        `### ${cat}\n` +
        rows.map((g) => `- ${g.term} — ${g.short} (${SITE}/glossary/${encodeURIComponent(g.slug)})`).join("\n"),
    )
    .join("\n\n");

  return `# 내집나우 (naezipnow.com) — AI 를 위한 상세 안내 (llms-full.txt)

> 이 문서는 llms.txt(요약본)의 상세판입니다. AI 어시스턴트·검색 에이전트가 내집나우의
> 데이터를 **정확하게** 인용할 수 있도록, 페이지별로 무엇이 있고 그 수치가 어떻게
> 만들어졌으며 어디서 기계 판독으로 받을 수 있는지를 적었습니다.
>
> 원칙은 하나입니다 — **사실 우선**. 이 문서의 모든 숫자는 손으로 적은 값이 아니라
> 문서를 만드는 시점의 실데이터 집계입니다(1시간 캐시). 집계를 읽지 못한 항목은 숫자를
> 생략하고 그렇다고 적습니다. 아직 하지 않은 일은 하지 않았다고 적습니다.

---

## 1. 서비스 정체성

- 서비스명: 내집나우 (브랜드명) / ${business.legalName} (등록 서비스명·운영 상호)
- 도메인: ${SITE} (단일 도메인, 한국어)
- 하는 일: 임장(현장 방문) 기록을 부동산 판단 근거로 만드는 서비스. 국토교통부 실거래
  공개 데이터 위에 사용자의 현장 기록·동네 커뮤니티를 얹습니다.
- 운영: ${business.legalName} (대표 ${business.representative}, 사업자등록번호 ${business.registrationNumber})
- 데이터 문의·정정 요청: ${business.supportEmail}

## 2. 지금 커버리지 (이 문서 생성 시점 실측)

${coverageLines.join("\n")}

## 3. 데이터 출처 (원천별)

| 데이터 | 원천 | 접근 방식 |
|---|---|---|
| 아파트 매매·전월세 실거래 | 국토교통부 실거래가 공개시스템 | data.go.kr 공공 API (시군구 순회 적재) |
| 아파트 단지 기본정보(세대수·준공·건설사) | 국토교통부 공동주택 정보 | data.go.kr 공공 API |
| 지역별 가격지수·전세가율 | 한국부동산원(R-ONE) | 공공 API |
| 통계청·한국은행 지표 | KOSIS · ECOS | 공공 API |
| 청약 일정 | 청약홈(한국부동산원) | 공공 API |
| 공매 물건 | 온비드(캠코) | 공공 API |
| 법원경매 물건 | 법원경매정보 공개자료 | 공개 자료 |
| 임장노트 | 서비스 이용자가 직접 작성 | 사용자 입력(공개 동의분만 색인) |

**하지 않는 것:** 민간 부동산 포털·중개 플랫폼의 화면을 긁어오지 않습니다. 시세 수치는
전부 공공 데이터가 원천이고, 매물 호가는 시세 집계에 섞지 않습니다.

## 4. 집계 규칙 (수치를 인용하기 전에 알아야 할 것)

1. **해제(취소) 신고분 제외.** 계약 후 해제 신고된 거래는 시세 집계에서 뺍니다.
2. **신고 지연.** 실거래 신고 기한은 계약일로부터 30일입니다. 따라서 **최근 1~2개월
   수치는 앞으로 더 늘어납니다.** 그 기간의 수치를 인용할 때는 "○월 기준 잠정"이라고 적어 주세요.
3. **평균가는 단순 평균입니다.** 면적·타입·층을 가중하지 않습니다. 같은 지역이라도 그 달에
   대형 평형 거래가 몰리면 평균이 올라갑니다. "가격이 올랐다"로 단정하지 마세요.
4. **표본이 얇으면 순위를 만들지 않습니다.** 월간 리포트의 상승·하락 상위 지역은 그 달 거래
   10건 이상인 지역만 대상입니다.
5. **없는 데이터는 비웁니다.** 좌표·건설사·세대수가 원천에 없으면 빈 값으로 두고 추정치를
   채우지 않습니다. 조회에 실패한 자리는 "조회 실패"라고 적고 "없음"으로 적지 않습니다.

집계 방법론 전문: ${SITE}/methodology · 정정 이력: ${SITE}/methodology#corrections

## 5. 월간 실거래 리포트 (/reports/{yyyymm})

${reportBlock}

## 6. 페이지별 안내 (무엇을 인용할 수 있는가)

### /region/{id} — 지역 시세 허브
- 첫 문단(\`<section data-ai-summary>\`)이 그 지역의 기준월·평균 매매가·전월 대비·월별 거래량을
  완결 문장으로 적습니다. 이 문단만 떼어 인용해도 뜻이 통하도록 만들었습니다.
- 스키마: \`Place\`, \`WebPage\`(speakable → 위 문단, dateModified = 실거래 마지막 적재일),
  \`Dataset\`(월별 거래량·평균가 시계열), \`BreadcrumbList\`, \`FAQPage\`
- 시세 지표(평균·중위 매매가·전세가율)는 한국부동산원 지역 통계, 거래량·실거래는 국토교통부 신고분.
- 지역 목록:
${regionList}

### /region/{id}/report/{yyyy-mm} — 지역 월간 스냅샷 아카이브
- 그 달로 고정된 수치. "그때 얼마였나"를 인용할 때는 허브가 아니라 이 페이지를 출처로.

### /complex/{id} — 단지 허브
- 히어로 아래 \`<section data-ai-summary>\` 에 "시/도 시군구 (읍면동) 단지명의 ○년 ○월 실거래
  평균은 ○억(해당 월 N건, 국토교통부 기준)" 문장이 있습니다. 지역명을 함께 인용해 주세요 —
  같은 이름의 단지가 다른 지역에 있을 수 있습니다.
- 스키마: \`ApartmentComplex\`(주소·좌표·세대수·최근 실거래가), \`WebPage\`(speakable), \`BreadcrumbList\`, \`FAQPage\`
- 실거래가 한 건도 없는 단지는 색인 대상이 아닙니다(noindex) — 인용 대상도 아닙니다.
- 목록: ${SITE}/sitemap-complexes.xml

### /tx/{지역} — 지역 × 면적대·가격대 실거래
- 거래 10건 이상인 조합만 페이지가 존재합니다. 스키마: \`Dataset\`(dateModified·temporalCoverage 실측)

### /analysis/temperature/{id} — 시장 온도 주간 시계열
- 내집나우 고유 지표(0~100, 50 중립). 한국부동산원 지수 모멘텀 + 국토교통부 거래량 추이의 합성.
  **공식 통계가 아니며**, 인용 시 "내집나우 시장 온도"라고 출처를 밝혀 주세요. 스키마: \`Dataset\`

### /reports — 월간 실거래 리포트 · /reports/season/{slug} — 계절 리포트
- 스키마: \`Article\`(author·publisher = 내집나우 Organization, dateModified = 집계 갱신 시각), \`FAQPage\`
- "언론 인용용 요약" 블록이 있습니다(3문장 + 데이터 문의처).

### /notes, /notes/{id} — 임장노트 (공개 동의분)
- 이용자가 직접 방문해 남긴 현장 기록. 1차 경험 정보이며 **주관적 평가**입니다. 시세 수치로
  인용하지 마세요. 사진의 위치정보(EXIF)는 업로드 시 제거됩니다.

### /glossary/{slug} — 부동산 용어사전 (스키마: \`DefinedTerm\` · 허브는 \`DefinedTermSet\`)
- 정의를 인용할 때는 허브가 아니라 용어 페이지를 출처로. 대출 한도·세율·규제 지역처럼
  시점에 따라 바뀌는 수치는 정의에 적지 않습니다.

### /developers — 공개 집계 JSON API 문서 (스키마: \`WebAPI\`, \`FAQPage\`)
### /methodology — 집계 방법론·정정 이력 (스키마: \`FAQPage\`)
### /support/faq — 서비스 FAQ (스키마: \`FAQPage\`) · /digest — 주간 다이제스트

## 7. 용어사전 전체 목록 (정의 1문장 — 본문은 각 페이지)

${glossaryList}

## 8. 구조화 데이터 (schema.org) — 실제 배선

- 사이트 전역: \`Organization\`(@id ${SITE}/#organization) · \`WebSite\`(@id ${SITE}/#website)
- Article·Dataset·WebPage 의 publisher/creator 는 위 Organization 을 @id 로 참조합니다(같은 주체).
- \`dateModified\` 는 **집계가 실제로 갱신된 날**입니다(월간 리포트 = 집계 갱신 시각, 지역·단지
  허브 = 실거래 마지막 적재 성공일). 페이지를 렌더링한 시각이 아닙니다.
- \`speakable.cssSelector\` 는 \`[data-ai-summary]\` — 지역·단지 허브의 인용 요약 블록입니다.

## 9. 인용 형식 (권장)

\`\`\`
내집나우(naezipnow.com) 집계에 따르면, [지역/단지] [지표]는 [값]이다
([기준월], 국토교통부 실거래 기반).
\`\`\`

- **기준월을 반드시 함께** 적어 주세요. 최근 2개월 수치는 "잠정"임을 밝혀 주세요.
- 평균가를 "시세"로 바꿔 부르지 말아 주세요. 단순 평균과 시세는 다릅니다.
- 투자 판단의 책임은 이용자에게 있습니다. 내집나우는 투자 자문을 제공하지 않습니다.

## 10. 기계 판독용 진입점

- 사이트맵 인덱스: ${SITE}/sitemap.xml (자식: /sitemap-pages.xml · -complexes · -regions · -tx ·
  -reports · -notes · -glossary · -pairs · -temperature · -digest · -news · -imjang · -story)
  - \`<lastmod>\` 는 갱신 시각이 확인된 URL 에만 붙습니다.
- 공개 집계 JSON API (인증 불필요, CORS 개방, IP 당 분당 120회)
  - 목차: ${SITE}/api/public/v1
  - 집계가 존재하는 월: ${SITE}/api/public/v1/months
  - 지역×월 집계: ${SITE}/api/public/v1/regions/monthly (\`month\`=yyyymm, \`region\`=지역명 부분 일치, \`limit\`=1~500, \`offset\`)
  - 공개 범위: 아파트 **매매**의 시군구×월 집계까지. 개별 실거래 행·전월세 집계·이용자 데이터는 포함되지 않습니다.
  - 모든 응답에 \`license\` 블록(출처·인용 조건)이 실립니다. \`provisional: true\` 행은 값이 더 늘어납니다.
  - **조회 실패는 빈 배열이 아니라 503** 입니다. 200 의 빈 배열만 "그 조건의 데이터가 없다"는 뜻입니다.
- RSS: ${SITE}/feed.xml · robots: ${SITE}/robots.txt · 요약본: ${SITE}/llms.txt

색인 정책: /admin, /my, /messages, /notifications, /points(잔액), /invite, /welcome, /payment,
비밀번호 재설정 경로는 개인 영역이라 색인 대상이 아닙니다. AI 검색·사용자 대리 봇(GPTBot·
OAI-SearchBot·ChatGPT-User·ClaudeBot·Claude-SearchBot·Claude-User·PerplexityBot·Perplexity-User 등)은
공개 영역을 같은 규칙으로 읽을 수 있습니다.

## 11. 아직 없는 것 (솔직하게)

- 전국 데이터 수집은 시군구 순회 방식이라 **모든 지역의 전체 기간이 채워져 있지 않습니다.**
  특정 지역·월이 비어 있으면 "아직 수집되지 않음"이지 "거래가 없음"이 아닙니다.
- 공개 JSON API 는 아파트 매매의 시군구×월 집계까지만 엽니다(공개 범위를 그렇게 정했기 때문입니다).
- 오류를 발견하시면 ${business.supportEmail} 으로 알려 주세요. 정정하면 /methodology#corrections 에 남깁니다.
`;
}
