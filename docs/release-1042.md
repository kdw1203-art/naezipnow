# 1042 — 사이트 메일 발송을 SMTP 로 켠다

소유자 지시(2026-10-06) "2번으로 해줘" — 1041 에서 드린 두 길 중 ② "이미 넣어 두신 `SMTP_*` 6개로 보내도록 코드를 바꾼다".
1041 위에 누적. DB·가격·상품 변경 없음. 의존성 1개 추가(`nodemailer` 8 · 의존성 없는 패키지 · MIT-0).

## 무엇이 바뀌나

발송기(`lib/email/send.ts`)가 Resend 키만 읽어서, 운영에 들어 있던 `SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS · SMTP_SECURE · SMTP_REQUIRE_TLS`(2026-06 등록 · Production)가 한 번도 쓰이지 않았다.
이제 **Resend 키가 있으면 Resend, 없으면 SMTP, 둘 다 없으면 미설정** 순서로 보낸다. 적용하면 Vercel 설정을 바꾸지 않아도 아래가 한꺼번에 켜진다.

| 메일 | 받는 사람 | 조건 |
|---|---|---|
| 환영 | 새 회원 | 첫 로그인 1회 · **가입 14일 안**(아래) |
| 비밀번호 재설정 링크 | 요청한 회원 | 사이트 발송이 먼저, 실패하면 예전처럼 Supabase 메일 |
| 비밀번호 변경 알림 | 본인 | 1041 문구가 이때부터 "알림 메일 발송"을 적는다 |
| 문의 접수 · 문의 답변 | 운영 주소 · 문의자 | — |
| 결제 영수증 · 갱신 사전 통지 · 결제 실패 | 결제한 회원 | — |
| 탈퇴 접수 | 본인 | — |
| 관심 단지 새 실거래 | 관심 단지가 있는 회원 | 설정의 "이메일 알림"이 켜져 있을 때(기본 켜짐) |
| 댓글 알림 | 글 작성자 | 글에서 알림을 켠 경우 |
| 주간 요약 · 재방문 알림 | 회원 | **마케팅 수신 동의자만** · 제목에 (광고) |
| 심각 경보(하루 1통 한도) · 관리자 로그인 알림 | `ALERT_EMAIL_TO` | 경보는 최근 24시간 critical 이 있을 때 |

## 켜지는 날의 사고를 막은 것

- **환영 메일은 가입 14일 안에만.** 운영 회원 5명 모두 환영 메일을 받은 적이 없다(가장 오래된 가입 7월). 그대로 켜면 다음 로그인에서 몇 달 늦은 "가입을 환영합니다"가 간다. 선점(`welcomed_at`)은 하되 보내지 않는다.
- **발신 주소 = SMTP 계정 주소**(`EMAIL_FROM` 이 없을 때). 계정과 다른 주소로 보내면 대부분의 서버가 거절하거나 주소를 바꿔 쓴다. 계정 아이디가 주소 꼴이 아니면(예: `apikey`) 기존 기본 주소를 쓰고, 거절되면 사유가 관리 화면에 보인다 — 그때는 `EMAIL_FROM` 을 넣는다.
- **포트와 `SMTP_SECURE` 가 어긋난 설정**(587 + secure=true 등)은 TLS 악수에서 바로 죽는다. 잘 알려진 포트는 포트를 따른다(465 = 접속부터 TLS · 587·25·2525 = STARTTLS).
- **시간 제한** 접속 8초 · 인사 8초 · 무응답 15초. 서버가 죽어 있어도 요청이 붙잡히지 않고, 실패는 값(`{ sent:false, reason }`)으로 돌아온다. 비밀번호·서버 응답 원문은 로그·화면에 싣지 않는다(코드만: 535 등).
- 보내지 못한 메일 큐(`notification_outbox`)는 0행이라 묵은 메일이 쏟아질 일은 없다(운영 DB 확인).

## 관리 화면

관리 › 운영 · 공지 맨 위에 **메일 발송** 줄: 수단(SMTP / Resend / 미설정) · 발신 주소 · **시험 메일 보내기**.
단추는 로그인한 관리자 자신의 주소로 한 통 보내고 결과를 그대로 적는다 — "발송 완료 · 받는 주소" 또는 "발송 실패 · SMTP 인증 실패(535) · 계정·비밀번호 확인".
운영의 SMTP 값은 암호화돼 있어 밖에서는 맞는지 알 수 없다 — **적용 뒤 이 단추를 한 번 눌러 확인**하는 것이 이번 묶음의 마지막 단계다. 받는 주소는 입력받지 않는다(계정당 10분 5회).

## 파일

- `lib/email/smtp-config.ts`(새 · 순수: `parseSmtpEnv` · `smtpFromAddress` · `smtpFailureReason`) · `lib/email/smtp-send.ts`(새 · nodemailer 는 보낼 때만 불러온다) · `lib/email/send.ts`(`mailProvider` · `mailStatus` · SMTP 분기) · `types/nodemailer.d.ts`(쓰는 만큼만 — `@types/nodemailer` 는 AWS SDK 를 끌고 온다)
- `lib/notifications/resend-send.ts`(Resend 키가 없으면 공용 발송기로) · `app/api/cron/notification-outbox-drain/route.ts`(발송 수단이 있으면 큐를 비운다)
- `lib/auth/welcome-email.ts`(`WELCOME_WINDOW_DAYS = 14` · `isRecentSignup`)
- `app/api/admin/email-test/route.ts`(새) · `app/admin/ops/MailTestPanel.tsx`(새) · `app/admin/ops/page.tsx`
- `app/api/health/route.ts`(`email.smtp`) · `scripts/validate-env.mjs`(메일 = Resend 키 **또는** SMTP 호스트) · 크론 응답 문구("메일 발송 미설정")
- `package.json` · `package-lock.json`(nodemailer 8.0.11 — next-auth 의 선택 peer 범위 `^7.0.7 || ^8.0.5` 안)

## 검증

- `npm run build` 전체 통과 · 단위 1,865(+12 `mail-1042`).
- **실제 발송**: 로컬 가짜 SMTP 서버(STARTTLS + 인증 · 자체 서명 인증서)를 띄우고 **빌드된 서버**에서 관리 화면의 시험 메일을 눌렀다 — 서버가 TLS 로 받은 메일의 보낸사람·받는사람·한글 제목·본문을 확인(전후 이미지의 메일이 그 메일이다). 같은 실행에서 관리자 로그인 알림도 같은 길로 도착했다(기존 호출부가 그대로 켜진다는 증거).
- 실패 경로: 틀린 비밀번호 → "SMTP 인증 실패(535)" · 죽은 포트 → "SMTP 서버 연결 실패" · 설정 없음 → "미설정"(단추 꺼짐).
- 확인하지 못한 것: **운영의 실제 SMTP 계정이 지금도 유효한가**(값을 볼 수 없다) — 적용 뒤 시험 메일 한 번으로 확인된다.

## 남은 것 (소유자)

- 적용 뒤 관리 › 운영 · 공지 → **시험 메일 보내기**. 실패면 사유를 알려 주시면 이어서 본다.
- 가입 인증 메일은 여전히 Supabase 가 보낸다. Supabase 대시보드 → Authentication → Emails → SMTP Settings 에 같은 SMTP 정보를 넣으면 그 메일도 같은 발신 주소로 나가고 시간당 한도·스팸함 문제가 줄어든다.
