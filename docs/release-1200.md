# release-1200 · 배포 막힘 정리 — 옛 Supabase 값 · 서비스 키 형식 검사

배경: 2026-11-10 새 Supabase 프로젝트(gjhnrpiiuhjzjzuuvdck)로 옮긴 뒤 Deploy to Vercel 이 계속 실패.

- deploy.yml "Sync public Supabase env": 옛 프로젝트(pbhiskvwpwwhtkmnhkbm) 주소·공개 키가 박혀 있었다.
  배포가 이 단계까지 가면 운영 주소를 옛 프로젝트로 되돌린다 → 이제 .env.production 에서 읽는다.
- deploy.yml "Sync service role env": 서비스 키 형식(sb_secret_… · JWT)이 아니면 동기화하지 않고 실패.
- check-source-views: SUPABASE_SERVICE_ROLE_KEY 가 공개 키(sb_publishable_…)나 anon JWT 면 처음부터 실패
  (anon 권한으로 조회가 통과해 "확인됨"처럼 보이던 구멍).

소유자 할 일: GitHub Secret SUPABASE_SERVICE_ROLE_KEY 에 새 프로젝트의 sb_secret_… 키.
