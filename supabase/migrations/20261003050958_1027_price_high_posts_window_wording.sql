-- [1027 · 제안 1] 신고가 자동 소식(external_key price-high:*) 37건의 "직전 3년" 문구 정정.
-- 글은 "직전 3년 최고가를 넘긴 계약"이라고 적었지만, 비교에 쓰인 매매 실거래는 3년에 못 미쳤다
-- (2026-10-03 운영: 계약월 2025.01~ · 9월 말까지는 2025.06~). RPC detect_new_price_highs 는 "직전 3년"을 훑되
-- 가진 만큼만 본다 — 그걸 3년이라 적은 것은 사실이 아니다. 숫자(신고가·이전 최고·표본 수)는 그대로 두고 말만 고친다.
-- 새 글은 줄마다 그 단지·면적대 이력의 첫 달을 읽어 적는다(lib/market/price-record-copy.ts priorWindowLabel).
-- 지난 글은 줄마다의 첫 달을 그때 값으로 되짚을 수 없어 "수집 기간"으로 적는다.
-- updated_at 은 표의 BEFORE UPDATE 트리거(set_board_posts_updated_at)가 고친 시각으로 바꾼다.
-- 롤백: 아래 replace 를 거꾸로(새 문구 → 옛 문구) 한 번 더 돌린다. 숫자·제목은 건드리지 않았다.
update public.board_posts
set content = replace(replace(replace(content,
      '신고분에서 직전 3년 최고가를 넘긴 계약', '신고분에서 이전 최고가를 넘긴 계약'),
      '(직전 3년 최고 ', '(수집 기간 최고 '),
      '기준: 같은 단지·비슷한 면적(±2㎡)의 직전 3년 신고가와 비교했고, 비교 표본이 10건 이상인 경우만 담았습니다.',
      '기준: 같은 단지·비슷한 면적(±2㎡)의 앞선 신고가와 비교했습니다(내집나우가 수집한 기간 안 · 최대 3년). 비교 표본이 10건 이상인 경우만 담았습니다.'),
    ai_summary = replace(ai_summary, '실거래 신고분 중 3년 최고가 경신', '실거래 신고분 중 이전 최고가 경신')
where external_key like 'price-high:%'
  and (content like '%직전 3년%' or ai_summary like '%3년 최고가 경신%');