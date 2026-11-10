# 1134 — 가입 실패 고치기(공개 키가 옛 프로젝트 값으로 떨어지던 문제)

2026-11-10 새 DB 전환 직후 가입이 "가입 처리 중 오류가 발생했습니다"로 실패했다.
운영 로그: `[auth/register] Supabase Auth signUp 거절 { status: 401, message: 'Invalid API key' }`.

## 원인

- 가입은 공개 키(anon · publishable)로 Supabase Auth 를 부른다. 공개 키는 env → 저장소의 `.env.production` → 코드 폴백 순으로 정해진다.
- `.env.production`(저장소에 커밋된 공개 값)과 코드 폴백이 **옛 프로젝트**(pbhiskvwpwwhtkmnhkbm) 값이었다.
  Vercel 의 공개 키 변수 가운데 하나라도 비거나 무효면 "새 주소 + 옛 키"가 되어 거절된다. 조회 · 저장은 관리용 키라 멀쩡했다.

## 고친 것

- `.env.production` · 코드 폴백(`lib/supabase/env.ts`) · `scripts/setup-vercel.mjs` 를 새 프로젝트(gjhnrpiiuhjzjzuuvdck) 값으로.
- 공개 키 검증: 주소와 다른 프로젝트의 anon JWT(ref 클레임) · 옛 프로젝트의 공개 키는 무효로 치고 다음 후보로 넘어간다.

## 검증

- 단위 테스트 2,624 통과 · 빌드 EXIT 0(로컬 빌드가 새 프로젝트를 공개 키로 읽는다).
- 가입은 운영 반영 뒤 소유자가 다시 해 본다(운영에서 폼 제출은 하지 않는다).
