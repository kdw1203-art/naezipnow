-- [1027] 온도 스냅샷 라벨 "인천 인천 중구" → "인천 중구".
-- 카탈로그 이름이 이미 "인천 중구"(다른 시의 중구와 정규화 키가 겹치지 않게 시/도를 접두한 항목)인데
-- 라벨을 만들 때 시/도를 한 번 더 붙였다(lib/market/temperature.ts TEMPERATURE_REGIONS). 화면(온도 순위 ·
-- 시세·타이밍 지역 선택)에 그대로 나갔다. 코드는 1027 에서 고쳤고, 이미 쌓인 행의 라벨만 여기서 맞춘다.
-- 점수·주차·지역 id 는 그대로다. 롤백: 라벨을 '인천 인천 중구'로 되돌린다(region_id = 'incheon-jung').
update public.market_temperature_snapshot
set region_label = '인천 중구'
where region_label = '인천 인천 중구';