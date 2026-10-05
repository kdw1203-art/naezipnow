# 1031 — 운영 루프 자동화 · 애드센스 저품질 대응 · 성능·운영 경보 (2026-10-04)

기준: 1030(tree 64ce4542) 위에 얹는다(1029·1029b 위에서도 적용 — 누적). DB 변경 없음.

## 운영 루프(사람에 기대지 않는 반복 업무) — 설계 문서는 Claude 문서 "내집나우 운영 루프 설계"
- `scripts/review/` — probe-prod(콘솔·응답·메타·axe·넘침·초점·다크) · design-probe(글자·굵기·반경·색·여백·파랑·줄 길이) · report(통과선 대조 → report.md · 위반 시 종료 1) · run.sh(`npm run review:prod`) · pack.sh + apply-template.ps1(묶음 포장) · routes.json(43경로)
- `.github/workflows/weekly-review.yml` — 월 00:10 UTC 자동 실측 · 아티팩트 90일 · 위반 시 이슈 "주간 운영 실측 위반: <주>"
- `docs/ops/review-loop.md` — 명령 · 통과선(숫자) · 분류 규칙 · 결정 규칙(48시간 기본 진행) · 보고·에스컬레이션
- 검증: 1030 실측 JSON 으로 돌려 위반 326건(22종)을 같은 숫자로 재현

## 애드센스 "저품질 콘텐츠" 대응(1단계) — 전략 문서 "불공정 우위 설계"의 콘텐츠 절
- 게시자 콘텐츠 없는 화면에 광고 스크립트를 싣지 않는다: lib/ads/adsense-policy.ts 제외 경로 + /login·/signup·/forgot-password·/reset-password·/search·/notifications·/messages·/complex/compare·/analysis/compare·/quiz·/offline·/welcome·/invite · 404 는 app/not-found.tsx `data-nz-noads` 로 표시(adsense-boot 가 본다)
- 다음 단계(코드 아님): 뉴스 요약 noindex · "준비 중" 화면 정리 · 원본 글 30편 · 2주 뒤 재검토 요청

## 성능(관리자 웹 바이탈 p75 캡처)
- /town LCP 5,912ms — LCP 요소가 lazy 커버 이미지(요청 1.5초 지연) → 동네 피드 첫 3장 `priority`(eager + fetchpriority=high)(app/town/feed-client.tsx)
- /search CLS 0.816 — 서버 빈 상태 → 마운트 뒤 결과로 바뀌며 푸터가 튐 → 결과 영역 `min-h-[70vh]`(search-client)
- 확인만: /analysis/temperature·/subscription/checkout·/my/points 의 LCP 는 표본 4~5건(p75 신뢰 낮음) · 결제 화면은 심사 동결 · 다음 주간 실측에서 재확인

## 운영 경보(관리자 운영 경보 캡처)
- seo.asset: /redevelopment canonical 누락 → `alternates: seoAlternates("/redevelopment")`
- app.etl_troubled(molit 비아파트): 1030 5차의 resultCode 30 즉시 중단 + 사유 줄 — 활용신청(소유자) 뒤 자동 회복
- seo.region_coverage(부산 영도구 508건): 비교 페이지 allowlist 가 DB MV 안에 수도권만 — 비수도권 확장은 결정 사항(보류 · 늘리면 자동 페이지가 늘어 애드센스 판정과 상충)

## 검증
- `npm run build` 전체 통과 · 테스트 1,772(+6) · 번들 예산 그대로
