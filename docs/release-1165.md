# 1165 — 운영 DB 느린 함수 고치기(단지 화면 시간 초과의 원인)

소유자 2026-11-12 "상세 · 하부 페이지 개선 · 산술적/기술적으로". 화면을 더 만들기 전에 운영 오류 기록과 DB 통계를 먼저 봤다.

## 찾은 것(운영 실측)
- `/complex/[id]` "단지 정보 조회 시간 초과(4000ms)" 25건 · `/region/[id]` 곁다리 섹션 조회 실패 다수 · `/dong/...` statement timeout.
- 원인 하나: `market_region_names()` 가 평균 4.3초 · 최대 8초(60회 호출). 매매 인덱스가 전부 `is_cancelled = false` 부분 인덱스인데 함수에 그 조건이 없어 52만 행 Seq Scan 을 129번 돌았다(단독 실행 24초까지 측정).
- 조건을 맞춘 같은 질의는 Index Only Scan **110ms**(EXPLAIN ANALYZE 실측). 결과 128개 지역 동일.
- 수집 작업의 지역 · 월 건수 조회 1,593회 · 평균 210ms(Seq Scan) — 인덱스가 없다.

## 고치는 것 — `supabase/rebuild/bridge/20261231001200_bridge_region_names_fast.sql`
- 함수에 `is_cancelled = false` 조건 추가.
- `mt_region_code_ym_idx (region_code, contract_ym)` 추가.
- 코드 변경 없음(SQL 한 번 실행). 이 세션에서는 운영 DB 변경이 막혀 소유자가 PowerShell 에서 실행한다.

## 그 밖에 확인된 운영 상태
- AI 분석 실행 기록 0건 · 회원 1명 · 임장노트 49개(모두 Lab 계정) — 새 DB 로 옮긴 뒤 실제 이용 기록이 아직 없다.
- 정비구역 위치 붙이기: 아직 0곳(1157 의 하루 2회 실행 전).
- 적재 정지 경보: 입주 예정 물량 · 시세 지수 · 시장 온도 스냅샷.
