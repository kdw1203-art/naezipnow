# 상업 이용 라이선스 대장 (1012 · 2026-09-27)

소유자 지시: "상업이용 라이센스는 꼭 확인해서 반영해줘". 사이트에 실리는 **모든 외부 자산**의 출처와
라이선스를 여기 적는다. 새 자산을 넣을 때는 이 표에 한 줄을 먼저 추가한다 — 표에 없는 자산은 쓰지 않는다.

| 자산 | 출처 | 라이선스 | 상업 이용 | 조건·우리가 한 일 |
|---|---|---|---|---|
| **Pretendard Variable** (본문 글꼴) | 길형진(orioncactus), github.com/orioncactus/pretendard | SIL Open Font License 1.1 | 가능 | 글꼴 자체를 판매하지 않는 한 자유. 서브셋 woff2 로 `public/fonts/pretendard/` 에 자체 호스팅(수정본 재배포도 OFL 허용). 표기 의무 없음 |
| **Noto Serif KR 600** (슬로건 띠 한 곳) | Google Fonts / Adobe, fonts.google.com/noto | SIL OFL 1.1 | 가능 | 슬로건 글자만 서브셋한 woff2 1장(51KB). 조건 동일 |
| **선 아이콘** `app/components/Icon.tsx` | Lucide(lucide.dev) 경로 데이터를 옮겨 적음 + 자체 추가 | ISC | 가능 | ISC 는 저작권·허가 문구를 사본에 포함하면 된다 — `Icon.tsx` 머리 주석에 표기(1012). `lucide-react` 패키지도 같은 ISC |
| **브랜드 로고·심볼** `public/brand/*.svg` | 자체 제작(내집나우) | 자체 저작 | 가능 | — |
| **직접 그린 일러스트** `public/illust/*.svg` (1012 신설) | 자체 제작 — 브랜드 3색 선화 | 자체 저작 | 가능 | 스톡·AI 생성 이미지 금지(디자인 시스템 v3 규칙 10) |
| **OG 카드 이미지** `app/api/og/*` | 서버에서 생성(글꼴은 위 Pretendard) | 자체 저작 | 가능 | — |
| **지도 타일·지오코딩** | 네이버 클라우드 Maps(`maps.apigw.ntruss.com`), VWorld(국토부) | 각 API 이용약관 | 약관 범위 내 | 네이버: 유료 과금 구간·로고 표기 의무 준수. VWorld: 키 등록 도메인(naezipnow.com 으로 갱신 필요 — release-1010 §9) |
| **공공데이터** | 국토교통부 실거래, 청약홈, 온비드, 한국부동산원, KOSIS, ECOS | 공공누리 1유형(출처 표시) 또는 각 기관 이용약관 | 가능 | 화면에 출처·시점 표기(디자인 시스템 v3 규칙 7) — `/data-sources` 페이지가 전체 목록 |
| **뉴스 제목·요약** (뉴스룸) | 언론사 RSS/공개 링크 | 저작권은 각 언론사 | 제목+짧은 요약+원문 링크만 | 본문 전재 금지. 카드는 제목·매체명·시각·원문 링크로 구성 |
| **사용자 사진·글** | 이용자 업로드 | 이용약관 §(이용자 콘텐츠 이용 허락) | 약관 범위 내 | — |
| **오픈소스 패키지** (`package.json`) | next(MIT) · react(MIT) · tailwindcss(MIT) · lucide-react(ISC) · @supabase/*(MIT) · next-auth(ISC) · pdf-lib(MIT) · exceljs(MIT) · fflate(MIT) · web-push(MIT) · html-to-image(MIT) · bcryptjs(MIT) · clsx(MIT) · tailwind-merge(MIT) · next-themes(MIT) · ffmpeg-static(GPL 바이너리 — **서버 빌드 도구로만, 화면 자산 아님**) | 각 라이선스 | 가능 | GPL 인 ffmpeg-static 은 사이트에 배포되지 않는 서버 유틸이라 배포 의무 없음. 링크 형태로 쓰지 않는지 주기 확인 |

## 쓰지 않는 것 (확인 완료 2026-09-27)
- 스톡 사진(Unsplash·Pexels·Pixabay·Shutterstock·Freepik): 소스·public 에 **0건** (`grep` 확인).
- 이모지 폰트에 의존하는 UI 배지: v3 규칙 4 로 금지, 게이트가 막는다.
- 타사 서비스의 서명적 장식(인스타그램 스토리 링 그라데이션): 1012 에서 제거.
