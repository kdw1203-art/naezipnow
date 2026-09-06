import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 스모크 테스트 설정 (#92)
 * - 대상 서버: E2E_BASE_URL (기본 http://localhost:3345 — `next start -p 3345`)
 * - 로컬: PLAYWRIGHT_BROWSERS_PATH 의 사전 설치 크로미움 사용
 * - CI: .github/workflows/e2e.yml 에서 `playwright install --with-deps chromium` 후 실행
 *
 * [968 · 50] 프로젝트 둘:
 * - chromium(Desktop Chrome): 기존 스위트 전부. `mobile-*.spec.ts` 는 제외한다 — 데스크톱
 *   뷰포트에는 하단 탭바(md:hidden)가 없어 그 검사가 무의미하다.
 * - mobile(Pixel 5 — 393×851, 터치, 모바일 UA): `tests/e2e/mobile-*.spec.ts` 만 돈다.
 *   같은 크로미움 바이너리를 쓰므로 e2e.yml 은 그대로다(`npx playwright test` 가 두 프로젝트를
 *   모두 실행한다). 스모크의 개별 케이스가 setViewportSize 로 흉내 내던 것과 달리 기기
 *   에뮬레이션(터치·UA·DPR)이 켜진 상태라 `(hover:none)`·`pointer:coarse` 분기까지 탄다.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 1,
  reporter: "line",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3345",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile-.*\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-.*\.spec\.ts/,
    },
  ],
});
