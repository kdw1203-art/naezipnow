#!/usr/bin/env node
/**
 * [1007] Vercel "Ignored Build Step" — 빌드가 필요 없는 커밋은 Vercel 빌드 머신을 쓰지 않는다.
 *
 * ── 어디에 걸리나 ────────────────────────────────────────────────────────────
 * vercel.json `ignoreCommand`. Vercel Git 연동이 푸시를 받아 **Vercel 빌드 머신에서**
 * 빌드를 시작하기 직전에 이 스크립트를 돌린다. 종료 코드 0 = 빌드 생략, 1 = 빌드.
 * (운영 배포는 .github/workflows/deploy.yml 이 `vercel build` + `vercel deploy --prebuilt`
 * 로 GitHub 러너에서 하므로 이 판정과 무관하다 — 여기서 걸리는 것은 Git 연동이 스스로
 * 만드는 미리보기 빌드다.)
 *
 * ── 실측 근거 ────────────────────────────────────────────────────────────────
 * Vercel 배포 목록(2026-09-20): dependabot 브랜치(`dependabot/npm_and_yarn/...`) 빌드 2건이
 * 전부 ERROR(target null) — 게이트 체인을 끝까지 돌리다 죽으며 Build CPU 를 태운다
 * (일일 비용 Build CPU $0.14~0.31, 빌드 날). 문서(docs/**)·테스트(tests/**)만 바뀐 커밋도
 * 산출물이 같은데 다시 빌드된다.
 *
 * ── 규칙(보수적으로) ──────────────────────────────────────────────────────────
 *  1) 브랜치가 `dependabot/` 로 시작하면 생략 — 의존성 갱신 PR 은 CI(deploy.yml 의 게이트)가
 *     검증하고, 미리보기 URL 이 필요한 사람이 없다.
 *  2) 바뀐 파일이 **전부** "산출물에 영향 없는" 경로(docs/ 아래, 모든 .md, tests/ 아래,
 *     .github/ 아래, .vscode/ 아래, LICENSE)이면 생략.
 *  3) 그 밖에는 전부 빌드. 판정에 필요한 정보(git 이력·바뀐 파일 목록)를 못 얻으면 **빌드**
 *     (모르면 빌드하는 쪽이 안전하다).
 *
 * 비교 기준: VERCEL_GIT_PREVIOUS_SHA(이 브랜치의 마지막 성공 배포 커밋)가 로컬 이력에
 * 있으면 그것과, 없으면 HEAD^ 와 비교한다. 한 번에 여러 커밋을 푸시했는데 마지막 커밋만
 * 문서 변경이면 HEAD^ 비교는 코드 변경을 놓친다 — 그래서 PREVIOUS_SHA 를 먼저 본다.
 *
 * 로컬 확인: `node scripts/vercel-ignore.mjs --dry <base>..<head>` 로 판정만 출력한다.
 * 순수 판정(shouldSkipBuild)은 tests/unit/cache-1007.test.ts 가 검증한다.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** 산출물(next build 결과)에 영향을 주지 않는 경로 규칙 */
const IGNORABLE = [
  /^docs\//,
  /(^|\/)[^/]+\.md$/,
  /^tests\//,
  /^\.github\//,
  /^\.vscode\//,
  /^LICENSE(\.[a-z]+)?$/,
];

/* main 은 **절대 건너뛰지 않는다** — 운영 배포는 Vercel Git 연동이 만든다(2026-09-20 실측:
   운영 배포 dpl_BJTJB… `source: "git"`, Vercel 빌드 192s). deploy.yml 의 prebuilt 경로는 보조다.
   여기서 main 을 막으면 운영 배포가 멈춘다. 문서만 바뀐 main 커밋은 아래 파일 규칙으로만 건너뛴다. */
const SKIP_BRANCH_PREFIXES = ["dependabot/"];

/**
 * 순수 판정.
 * @param {{ ref?: string | null, changedFiles?: string[] | null }} input
 * @returns {{ skip: boolean, reason: string }}
 */
export function shouldSkipBuild(input) {
  const ref = (input.ref ?? "").trim();
  for (const p of SKIP_BRANCH_PREFIXES) {
    if (ref === p || ref.startsWith(p.endsWith("/") ? p : `${p}/`)) return { skip: true, reason: `브랜치 ${ref} — 의존성 봇 PR 은 미리보기 빌드를 만들지 않는다` };
  }
  const files = input.changedFiles;
  if (!Array.isArray(files)) return { skip: false, reason: "바뀐 파일 목록을 알 수 없음 → 빌드" };
  if (files.length === 0) return { skip: false, reason: "바뀐 파일 0개(비교 실패 가능성) → 빌드" };
  const building = files.filter((f) => !IGNORABLE.some((re) => re.test(f)));
  if (building.length === 0) {
    return { skip: true, reason: `바뀐 ${files.length}개 파일이 전부 문서·테스트·CI 설정 → 빌드 생략` };
  }
  return { skip: false, reason: `산출물에 영향 있는 파일 ${building.length}개(예: ${building[0]}) → 빌드` };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function hasObject(sha) {
  if (!sha) return false;
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** 비교 기준 커밋 — 마지막 성공 배포(있으면) > HEAD^ > null.
    [1007 · 리뷰 M1] main(운영)은 HEAD^ 폴백을 쓰지 않는다: 코드 커밋 + 문서 커밋을 한 번에 푸시하면
    HEAD^..HEAD 가 "문서만" 으로 보여 **운영 빌드가 생략**될 수 있다. 마지막 배포 SHA 를 모르면 빌드한다. */
function baseRef(ref) {
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();
  if (prev && hasObject(prev)) return prev;
  if (ref === "main" || process.env.VERCEL_ENV === "production") return null;
  if (hasObject("HEAD^")) return "HEAD^";
  return null;
}

function changedFilesBetween(base, head = "HEAD") {
  try {
    const out = git(["diff", "--name-only", base, head]);
    return out ? out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  } catch {
    return null;
  }
}

function main() {
  const dry = process.argv.indexOf("--dry");
  let base = null;
  let head = "HEAD";
  if (dry >= 0) {
    const range = process.argv[dry + 1] ?? "";
    const m = /^(.+?)\.\.(.+)$/.exec(range);
    if (m) {
      base = m[1];
      head = m[2];
    } else if (range) base = range;
  }
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  if (!base) base = baseRef(ref);
  const changedFiles = base ? changedFilesBetween(base, head) : null;
  const verdict = shouldSkipBuild({ ref, changedFiles });
  console.log(`[vercel-ignore] base=${base ?? "(없음)"} ref=${ref ?? "(없음)"} files=${changedFiles?.length ?? "?"} → ${verdict.skip ? "생략" : "빌드"} — ${verdict.reason}`);
  if (dry >= 0) return;
  process.exit(verdict.skip ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
