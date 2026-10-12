# 1062 — 글 많은 화면을 표·요약·낱말로 (애플 방향) (2026-10-12)

소유자 지시: "추가개선 및 사이트 전반적으로 디자인 간결과, 이렇게 글씨가 많이 나온 페이지들이 많거든 이런것들을 표나 그래프,
요약, 키워드 형식으로 심플하고 직관적으로 바꿔주고 개선해줘 · 애플의 디자인 방향성을 참고해줘" (요금제 FAQ·고지 화면 캡처 첨부).

## 원칙 — 글을 지우지 않고 자리를 바꾼다

사실·수치·법정 문구는 **한 글자도 지우거나 고치지 않는다**(심사 고정 문구·JSON-LD·검사 대상이 걸려 있다). 대신:
요약을 먼저 보이고 · 긴 문단은 눌러야 펼쳐지게(native `<details>`) · 조건·고지는 "항목 | 사실" 표로 · 비교는 길이로.
애플 쪽에서 가져온 것은 넷이다 — 한 줄에 뜻 하나, 왼쪽 이름·오른쪽 값, 강조는 색이 아니라 굵기, 상자 대신 여백과 머리카락 선.

## 공용 조각 5개 (app/components/compact/)

| 조각 | 쓰는 자리 | 규칙 |
| --- | --- | --- |
| `FaqCompact` | 문답·원칙·단계처럼 "제목 + 문단"이 반복되는 자리 | 질문 한 줄 + 핵심 낱말 칩(최대 4) · 답은 `<details>` 안 · FAQPage JSON-LD 는 보이는 배열에서 한 번만(`jsonLd={false}` 로 끈다) |
| `FactTable` | 조건·고지·규격 | "항목 \| 사실" 두 칸 · 폰은 위아래, 데스크톱은 좌우 |
| `KeyPoints` | 긴 설명 위 2~4줄 요약 | "짧은 라벨 — 한 문장" · 본문에 있는 말만 |
| `KeywordChips` | 문단 대신 낱말 | 읽는 것(단추 아님) |
| `MiniBar` | 수 비교 | 실측만 · 라벨·수를 함께 적는다 · 단위가 다른 값은 쓰지 않는다 |

JS 0(서버 컴포넌트) · 폰 `summary` 40px 탭 면 · 칩이 줄을 넘으면 화살표가 혼자 남지 않게 격자 두 칸(질문 \| 화살표, 칩은 아랫줄).
[1012] 폰 한 줄 말줄임 규칙의 예외를 접힌 글(`.faq-compact` 답 · `li` 안 `.fineprint-body`)에 달았다 — 펴 놓고 잘리면 뜻이 사라진다.

## 바꾼 화면 13개

- `/subscription` — FAQ 5문단 → 접힌 행 + 칩(세로 460 → 278px, 데스크톱 실측) · 맨 아래 가운뎃점 한 줄 → 결제 방식·환불·세금·배지 4줄 표. 심사 고정 문구(ComplianceNotice·가격·사업자 정보)는 그대로.
- `/about` — 운영 원칙 4장(제목 + 문단) → 한 판 안 원칙 4줄 + 칩.
- `/support/faq` — 분류별 문답 → 접기 + 하단 안내 문단 → 표.
- `/methodology` — 항목마다 핵심 2~4줄(KeyPoints) + 요인 칩, 본문은 "자세히" 접기.
- `/guides/[slug]`·`/guides/contract`·`/guides/regulations` — 단계·조항·특약·제도를 접힌 행과 "조항 \| 적을 내용" 표로(HowTo·FAQPage JSON-LD 그대로).
- `/journey/contract` — 머리말 → 요약 줄.
- `/developers` — 엔드포인트 카드 3장 → 한 판 3행(GET 칩 + 경로 + curl) · 상태 코드·파라미터는 표 · 문답 7개 접기(늘 보이는 글 약 −65%).
- `/data-sources` — 출처 11장 × 네 문단 → 한 판 11행(이름 \| 갱신 주기), 원천·쓰이는 곳·한계는 접기 안 표(−77% · 세로 2,466 → 1,544px).
- `/pro` — 설명·조건 6줄 접기, 중점 문장 → 칩 6개.
- `/town/experts` — 분야 카드 7장 → 7행(이름 \| 인증 N명), FAQ 6개 접기, 보증 문구 → 칩.
- `/safety` — 체크리스트 12줄 → 6줄 + 확인 낱말 칩, 확인 방법은 접기 · 열람처 한 문단 접기.

## 검증

- 빌드 EXIT 0 · 단위 2,277 통과(신규 `tests/unit/review-1062.test.ts` 5건 — 조각 계약 · 폰 규칙 · FAQPage 중복 없음 · 사실 보존 표본 · 디자인 규칙).
- 게이트: type-ramp · ai-look · route-links · dead-controls · icon-names · contrast-tokens · plan-labels · import-hygiene · ai-compliance · **toss-review-freeze(심사 제출 사실 24건 일치)** 전부 통과.
- 캡처: `/subscription` FAQ · `/data-sources`(데스크톱) · `/guides/contract` · `/town/experts`(폰) 전(운영)/후(로컬 빌드).

## 남긴 것

- `app/notes/templates/TemplateBrowser.tsx`(카드 설명·공유 폼)과 `/supply`·`/redevelopment`·`/auctions`의 데이터 화면은 다음 묶음.
- 1060 에서 적은 soft 404 12경로 · 뉴스 H1 · 썸네일 alt · 홈 title · 단지 통칭도 그대로 남아 있다.
