# 1039 — 회원가입 개선

소유자 지시(2026-10-05) "회원가입 기능에 대해 개선작업해줘". 1038 위에 누적. DB·가격·상품 변경 없음.

## 왜
- 30일 실측: 가입 화면 진입 이벤트 452건 · 실제 가입 +1 · `user_onboarding` 0행 · 프로필 핸들 0.
- 코드에서 확인한 것: 오류가 한 줄로만 뜨고 초점이 그대로 · placeholder 가 이름표 · 중복 이메일 안내가 서로 어긋남(링크 없음) ·
  인증 메일 링크를 누르면 목적지(/welcome)를 잃음 · **구글·카카오 가입자는 app_users 행이 안 생겨** 환영 메일·온보딩 저장이 조용히 실패 ·
  로그인 실패 때마다 입력 칸이 새로 만들어져 폰 자판이 닫힘.

## 바뀐 것
| 영역 | 내용 | 파일 |
|---|---|---|
| 폼 검증 | `noValidate` + 화면 검증 · 칸마다 오류(`aria-invalid`·`aria-describedby`) · 첫 오류 칸으로 초점 · 이메일 형식(EMAIL_RE — 화면·서버 같은 식) | `app/signup/SignupClient.tsx` · `lib/auth/signup-form.ts` |
| 라벨 | placeholder 이름표 → 떠오르는 실제 `<label>`(.njn-field · 로그인과 같은 꼴) | 같음 · `app/globals.css`(오류 테두리 append) |
| 이메일 오타 | gmial.com · naver.con · hanmail.com … → "… 로 고치기" 한 번 | `lib/auth/signup-form.ts` |
| 비밀번호 | 강도 줄 4칸 + 낱말("5/8자" → "보통" …) · 표시 단추 40px | 같음 |
| 동의 | "전체 동의 · 선택 2개 포함" 한 칸 추가 · 소셜 단추 아래 동의 대상 한 줄(로그인 화면과 같은 방식) | `SignupClient.tsx` |
| 중복 이메일 | 문장 → 행동 두 개(이 이메일로 로그인 · 비밀번호 찾기) · 이메일은 탭 저장소로 넘김(주소에 싣지 않음) | `SignupClient.tsx` · `LoginClient.tsx` · `forgot-password/page.tsx` |
| 인증 메일 안내 | 순서 3칸 · 메일함 바로 열기(네이버·Gmail·다음·카카오·네이트·Outlook) · 재발송 30초 대기 · 제목으로 초점 · aria-live | `SignupClient.tsx` |
| 인증 뒤 목적지 | 가입 화면이 `next`(/welcome[?next])를 보내고, 인증 링크가 `/login?verified=1&…&callbackUrl=` 로 돌아옴(내부 경로만) | `app/api/auth/register/route.ts` |
| 서버 | 숨은 칸(website) 봇 덫 · 이름 30자 상한 · DB 원문 메시지 응답에서 제거 | 같음 |
| 소셜 가입 | 구글·카카오 첫 로그인에 `ensureAppUserRow` — 환영 메일·온보딩·프로필 저장이 동작 | `auth.ts` |
| 로그인 | 폼 `key` 리마운트 제거(흔들림은 상태로) · 비밀번호 표시 · "비밀번호 찾기" 손끝 칸 · "이 이메일로 가입하기"가 이메일 넘김 | `app/login/LoginClient.tsx` |
| 진입 | 소프트 가입 창 "가입하고 이어하기" → /signup(예전 /login) + 계정 있는 사람용 "로그인 ›" | `app/components/soft-signup/SoftSignupProvider.tsx` |
| 관측 | `signup_complete` 는 재발송을 세지 않음 · `welcome_view`·`welcome_finish`·`welcome_skip` 추가 · 이벤트 수신부가 화면과 같은 봇 판별 사용 | `SignupClient.tsx` · `WelcomeClient.tsx` · `app/api/platform/event/route.ts` |

## 그대로 둔 것
- `signup_step_1` 계측(1027 · 사람이 처음 움직였을 때 1회) · "가입하고 노트 쓰기" 단추 · 약관·방침 문서 · 요금제·결제 화면.
- 비밀번호 확인 칸은 다시 넣지 않았다(개선 #9 결정 유지 — 표시 단추로 확인).

## 다음 후보(이번에 넣지 않음)
- 소셜 가입의 동의 기록(user_consents)을 첫 OAuth 로그인에 저장 · 프로필 핸들 자동 부여(1035 제안 46) · 가입 API Turnstile ·
  비밀번호 찾기 → 재설정 → 로그인 사이 callbackUrl 유지 · 안 쓰는 표(`user_onboarding`·`user_policy_consents`) 정리.

## 검증
- `npm run build` 전체 통과 · 단위 +8(`tests/unit/signup-1039.test.ts`) · /signup 405KB · /login 379KB(상한 495).
- 전후 캡처(폰·데스크톱): 빈 화면 · 빈 제출 · 입력 중 · 중복 이메일 · 인증 메일 안내 · 로그인. 가입 API 응답은 브라우저 안에서 가짜로 돌려 운영 서버에 가입 요청을 보내지 않았다.
