/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
import type { Metadata } from "next";
import Link from "@/app/components/IntentLink";
import { getMeeting } from "@/lib/meetings/store-db";
import { findImjangRegionForLabel } from "@/lib/imjang/guide";
import { safeAuth } from "@/lib/safe-auth";
import { ShellBreadcrumb, ShellNarrow } from "../../../components/PageShell";
import { ShareButton } from "./ShareButton";
import { LocationMap } from "../../LocationMap";
import { Icon } from "@/app/components/Icon";
import { formatKstLongDate } from "@/lib/format/kst";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";
import { CLUB_BOARDS, CLUB_TABS, clubTab, isUuid, kstParts, scheduleLine, type ClubBoardId } from "@/lib/groups/club";
import { clubRole, loadMyComplexes, loadMyNoteTitles, loadPolls, loadPosts, loadSchedules } from "@/lib/groups/club-store";
import type { Loaded, PollView, PostView } from "@/lib/groups/club-types";
import { ClubSchedule } from "./ClubSchedule";
import { ClubBoard } from "./ClubBoard";
import { ClubPolls } from "./ClubPolls";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-bold(800) 를 전부 font-bold(700) 로 내렸다. */

/* 시안 8o(모임 상세) 고도화 — 모임 정보 카드(일정·장소·정원·참여자) + 공유 +
   참여 상태별 CTA. "채팅방 입장"은 /town/groups/[id]/chat 로 분리(실채팅 유지). */

export const dynamic = "force-dynamic";

/* 동적 metadata — 예전에는 제목·설명이 루트 기본값으로 나가 공유·검색에서 모든
   모임이 똑같이 보였다. 실제 모임명·지역을 제목에 싣는다.
   + 네이버 SEO 가이드 반영(2026-08-16): 없는 모임·조회 실패의 "찾을 수 없어요"
   화면에는 noindex 를 단다 — 빈 안내 문서가 색인 가능한 상태로 수집되고 있었다
   (가이드의 불용문서 케이스). HTTP 상태는 상위 loading.tsx 스트리밍이 200 을
   먼저 커밋해 notFound() 로도 404 로 바꿀 수 없음을 실측 확인 — 완전한
   소프트404 해소는 loading 경계 위 존재확인이 필요한 구조 변경(워크오더).
   실재 모임은 색인 허용(원안 유지). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meeting = await getMeeting(id).catch(() => null);
  if (!meeting) {
    return {
      title: "임장 모임 | 내집나우",
      robots: { index: false, follow: false },
    };
  }
  const region = meeting.region || "";
  const title = `${meeting.title}${region ? ` · ${region}` : ""} 임장 모임 | 내집나우`;
  const desc =
    (meeting.description || "같은 단지를 함께 돌아볼 이웃을 찾는 임장 모임입니다.")
      .replace(/\s+/g, " ")
      .slice(0, 150);
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, images: DEFAULT_OG_IMAGES },
  };
}

/* [970 · C-01] toLocaleString 에 timeZone 이 없어 서버(UTC)에서 9시간 이른 일시가 나갔다.
   한국 시간으로 고정 — "2026년 9월 6일 (토) 14:30". */
function formatSchedule(iso: string | null): string {
  if (!iso) return "일정 미정";
  return formatKstLongDate(iso, { weekday: true, time: true }) || "일정 미정";
}

export default async function TownGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  /* 이 모임이 이 페이지의 존재 이유다. 예전에는 `.catch(() => null)` 로 조회
     실패를 삼켜서 "모임을 찾을 수 없어요"(삭제된 모임과 똑같은 화면)를 200 으로
     내보냈다. 못 읽은 것과 없는 것은 다른 사실이다 — 조회가 실패하면 던져서
     5xx("지금은 못 준다")가 되게 두고, 아래 안내 화면은 **정말로 없을 때만**
     그린다. 세션은 곁다리라 실패해도 비로그인으로 계속 그린다. */
  const [meeting, session] = await Promise.all([getMeeting(id), safeAuth()]);

  if (!meeting) {
    return (
      <ShellNarrow>
        <ShellBreadcrumb>동네이야기 › 임장 모임</ShellBreadcrumb>
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-20 text-center">
          <div className="t-title font-bold text-ink">모임 없음</div>
          <p className="t-body leading-[1.6] text-text-2">
            삭제되었거나 잘못된 링크일 수 있어요.
          </p>
          <Link
            href="/town/groups"
            className="btn-primary rounded-xl px-5 py-2.5 t-body no-underline"
          >
            모임 목록으로
          </Link>
        </div>
      </ShellNarrow>
    );
  }

  /* 크루 도구(전략 §5 회로 4) — 모임 지역이 임장 가이드 지역과 맞으면 잇는다.
     곁다리 강화라 실패는 삼키고 링크만 생략한다(모임 본문 존재 판정과 무관). */
  const imjangRegion = meeting.region
    ? await findImjangRegionForLabel(meeting.region).catch(() => null)
    : null;

  const myEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const remaining = meeting.maxMembers - meeting.currentMembers;
  const isFull = remaining <= 0;
  /* [2026-08-22] 지난 모임 판정 — 목록(GroupsClient.deriveStatus)은 날짜를 보고
     "일정 종료"라고 말하는데 이 상세는 정원만 봐서, 어제 끝난 모임이 "모집 중 ·
     참여하기"로 나갔다(목록 주석이 금지한 바로 그 화면). 같은 판정을 쓴다. */
  const scheduledTs = Date.parse(meeting.scheduledAt ?? "");
  const isPast = Number.isFinite(scheduledTs) && scheduledTs < Date.now();
  const statusLabel = isPast
    ? "일정 종료"
    : isFull
      ? "모집 마감"
      : remaining <= 1
        ? "마감 임박"
        : "모집 중";
  const statusStyle =
    isPast || isFull
      ? "bg-bg text-text-3"
      : remaining <= 1
        ? "bg-warning-soft text-warning"
        : "bg-primary-soft text-primary";
  const isOrganizer = myEmail !== null && meeting.organizerEmail?.trim().toLowerCase() === myEmail;
  const fillPct = Math.min(100, Math.round((meeting.currentMembers / Math.max(1, meeting.maxMembers)) * 100));

  /* [1168] 모임 일정 · 게시판 · 투표. 일정은 누구나 보고(모집에 필요), 글과 투표는 멤버만 본다.
     테이블이 아직 없는 DB 에서는 탭을 그리지 않고 예전 화면 그대로 둔다. */
  /* [1170] 권한 확인과 일정 읽기를 같이 보내고, 글 · 투표 · 내 노트는 그 탭(과 홈의 공지)에서만 읽는다 —
     탭마다 5~7번 가던 왕복이 2~4번으로 준다. */
  const wantTab = clubTab(sp.tab);
  const none = <T,>(): Promise<Loaded<T> | null> => Promise.resolve(null);
  const [role, schedules] = await Promise.all([
    clubRole(id, meeting.organizerEmail, myEmail).catch(() => ({ member: isOrganizer, organizer: isOrganizer })),
    loadSchedules(id, myEmail),
  ]);
  const clubOn = schedules.state !== "missing";
  const tab = clubOn ? wantTab : "home";
  const [posts, polls, myNotes, myComplexes] = await Promise.all([
    clubOn && role.member && (tab === "board" || tab === "home") ? loadPosts(id, myEmail, role.organizer) : none<PostView[]>(),
    clubOn && role.member && tab === "poll" ? loadPolls(id, myEmail) : none<PollView[]>(),
    clubOn && role.member && tab === "board" ? loadMyNoteTitles(myEmail) : Promise.resolve([]),
    clubOn && role.member && tab === "schedule" ? loadMyComplexes(myEmail) : Promise.resolve([]),
  ]);
  const nowIso = new Date().toISOString();
  const scheduleList = schedules.state === "ok" ? schedules.data : [];
  const upcoming = scheduleList.filter((s) => s.scheduledAt >= nowIso);
  const notices = posts?.state === "ok" ? posts.data.filter((p) => p.board === "notice").slice(0, 2) : [];
  const writeRaw = typeof sp.write === "string" ? sp.write : "";
  const initialWrite = (CLUB_BOARDS.find((b) => b.id === writeRaw)?.id ?? null) as ClubBoardId | null;
  const failed = <div className="card p-5 text-center t-body text-text-3">모임 정보 불러오기 실패 · 잠시 후 다시</div>;
  const membersOnly = <div className="card p-5 text-center t-body text-text-3">모임 참여 후 열람 가능</div>;

  return (
    <ShellNarrow>
      <ShellBreadcrumb>동네이야기 › 임장 모임</ShellBreadcrumb>
      {/* [998 · A5] md → lg: 태블릿은 1열, 2열은 lg 부터. 사이드바 폭은 340 하나. */}
      <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------- 모임 정보 카드 ---------- */}
        <div className="flex flex-col gap-4">
          {clubOn && (
            <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1" aria-label="모임 메뉴">
              {CLUB_TABS.map((t) => (
                <Link
                  key={t.id}
                  href={t.id === "home" ? `/town/groups/${id}` : `/town/groups/${id}?tab=${t.id}`}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 t-sub font-bold no-underline ${
                    tab === t.id ? "bg-ink text-surface" : "text-text-2"
                  }`}
                >
                  {t.label}
                  {t.id === "schedule" && upcoming.length > 0 ? ` ${upcoming.length}` : ""}
                </Link>
              ))}
              <Link
                href={`/town/groups/${id}/chat`}
                className="flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 t-sub font-bold text-text-2 no-underline"
              >
                채팅
              </Link>
            </nav>
          )}
          {tab === "schedule" &&
            (schedules.state === "ok" ? (
              <ClubSchedule
                groupId={id}
                schedules={scheduleList}
                canWrite={role.member}
                isOrganizer={role.organizer}
                nowIso={nowIso}
                groupTitle={meeting.title}
                myComplexes={myComplexes}
                initialComplex={
                  typeof sp.complex === "string" && sp.complex.trim() && typeof sp.cname === "string" && sp.cname.trim()
                    ? { id: sp.complex.trim().slice(0, 40), name: sp.cname.trim().slice(0, 40) }
                    : null
                }
                initialDate={typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null}
              />
            ) : (
              failed
            ))}
          {tab === "board" &&
            (!role.member ? (
              membersOnly
            ) : posts?.state === "ok" ? (
              <ClubBoard
                groupId={id}
                posts={posts.data}
                canWrite={role.member}
                isOrganizer={role.organizer}
                myNotes={myNotes}
                pastSchedules={scheduleList
                  .filter((s) => s.scheduledAt < nowIso)
                  .reverse()
                  .slice(0, 30)
                  .map((s) => ({ id: s.id, title: s.title }))}
                initialWrite={initialWrite}
                initialSchedule={isUuid(sp.schedule) ? sp.schedule : null}
              />
            ) : (
              failed
            ))}
          {tab === "poll" &&
            (!role.member ? (
              membersOnly
            ) : polls?.state === "ok" ? (
              <ClubPolls
                groupId={id}
                polls={polls.data}
                canWrite={role.member}
                isOrganizer={role.organizer}
                minDate={kstParts(nowIso)?.ymd ?? ""}
              />
            ) : (
              failed
            ))}
          {tab === "home" && (
          <>
          <div className="rise-in card flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between">
              <span className={`rounded-md chip-pad t-sub font-bold ${statusStyle}`}>
                {statusLabel} {meeting.currentMembers}/{meeting.maxMembers}
              </span>
              <span className="t-sub text-text-3">
                {meeting.category}
                {meeting.fee > 0 ? ` · 참가비 ${meeting.fee.toLocaleString("ko-KR")}원` : " · 무료"}
              </span>
            </div>

            <h1 className="t-title font-bold leading-[1.35] text-ink">{meeting.title}</h1>

            <div className="flex flex-col gap-2 t-body text-text-1">
              <div className="flex gap-2">
                <span className="w-5 text-center"><Icon name="calendar" size={16} className="inline align-middle" /></span>
                <span>{formatSchedule(meeting.scheduledAt)}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-5 text-center"><Icon name="pin" size={16} className="inline align-middle" /></span>
                <span>{meeting.region || [meeting.city, meeting.district].filter(Boolean).join(" ") || "장소 미정"}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-5 text-center"><Icon name="user" size={16} className="inline align-middle" /></span>
                <span>모임장 · {meeting.organizerLabel || meeting.hostLabel}</span>
              </div>
              {meeting.checklist.length > 0 && (
                <div className="flex gap-2">
                  <span className="w-5 text-center"><Icon name="footprints" size={16} className="inline align-middle" /></span>
                  <span>{meeting.checklist.slice(0, 4).join(" → ")}</span>
                </div>
              )}
            </div>

            {meeting.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {meeting.tags.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-full bg-bg px-2.5 py-1 t-sub text-text-2">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <p className="whitespace-pre-wrap rounded-xl bg-bg px-4 py-3.5 t-body leading-[1.7] text-text-2">
              {meeting.description || "모임 소개 없음"}
            </p>
          </div>

          {/* 참여자 카드 */}
          <div className="rise-in-1 card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="t-body font-bold text-ink">
                참여자 {meeting.currentMembers}
                <span className="text-text-3"> / {meeting.maxMembers}</span>
              </div>
              <div className="t-sub text-text-3">{isFull ? "정원이 찼어요" : `${remaining}자리 남음`}</div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-primary" style={{ width: `${fillPct}%` }} />
            </div>
            {/* 목록(/town/groups)에서 같은 이유로 이미 걷어낸 가짜 아바타 원을 여기서도
                지운다. 참여자 프로필을 읽지 않고 색만 다른 원을 currentMembers 수만큼
                그리던 것이라, 정원이 0명일 때도 원이 하나 떠서 "누군가 있다"고 보였다.
                실제로 아는 사실은 인원수뿐이므로 인원수만 남긴다. */}
            <p className="t-sub leading-[1.5] text-text-3">
              참여 확정 시 채팅방에서 멤버들과 일정·체크리스트를 나눌 수 있어요 · 연락처는 공개되지 않아요
            </p>
          </div>
          {clubOn && (notices.length > 0 || upcoming.length > 0) && (
            <div className="rise-in-1 card flex flex-col gap-2.5 p-5">
              {notices.map((n) => (
                <Link
                  key={n.id}
                  href={`/town/groups/${id}?tab=board`}
                  className="flex items-center gap-2 t-sub text-text-1 no-underline"
                >
                  <span className="shrink-0 rounded-md bg-warning-soft chip-pad t-caption font-bold text-warning">공지</span>
                  <span className="truncate">{n.body.split("\n")[0]}</span>
                </Link>
              ))}
              {upcoming.slice(0, 3).map((s) => (
                <Link
                  key={s.id}
                  href={`/town/groups/${id}?tab=schedule`}
                  className="flex items-center gap-2 t-sub text-text-1 no-underline"
                >
                  <span className="shrink-0 rounded-md bg-primary-soft chip-pad t-caption font-bold text-primary">일정</span>
                  <span className="truncate">
                    <span className="font-bold text-ink">{s.title}</span> · {scheduleLine(s)}
                  </span>
                </Link>
              ))}
            </div>
          )}
          </>
          )}
        </div>

        {/* ---------- 사이드: 위치 + 공유 + CTA ---------- */}
        <div className="flex flex-col gap-3">
          <div className="rise-in-1 card flex flex-col gap-2 p-5">
            <div className="t-body font-bold text-ink">모임 장소</div>
            {/* 지역명을 좌표로 해석해 네이버 지도로 표시(정확 집결지는 채팅방 안내) */}
            <LocationMap
              region={meeting.region}
              city={meeting.city}
              district={meeting.district}
              label={meeting.region || meeting.city || "모임 장소"}
            />
            <p className="t-sub leading-[1.5] text-text-3">
              지역 기준 지도 · 집결 장소는 모임 채팅방 안내
            </p>
          </div>

          {/* 크루 도구 — 답사 전 준비를 내집나우 안에서 끝내게 한다 */}
          <div className="rise-in-1 card flex flex-col gap-2 p-5">
            <div className="t-body font-bold text-ink">임장 준비</div>
            <p className="t-sub leading-[1.6] text-text-2">
              데이터 브리핑 · 현장 체크포인트 · 임장노트
            </p>
            <div className="flex flex-col gap-1.5">
              {imjangRegion && (
                <Link
                  prefetch={false}
                  href={`/imjang/${encodeURIComponent(imjangRegion.slug)}`}
                  className="t-body font-bold text-primary no-underline"
                >
                  {imjangRegion.name} 임장 가이드 ›
                </Link>
              )}
              <Link href="/notes/templates" className="t-body font-bold text-text-2 no-underline hover:text-primary">
                노트 템플릿 보기 ›
              </Link>
              <Link href="/notes/new" className="t-body font-bold text-text-2 no-underline hover:text-primary">
                임장노트 쓰기 ›
              </Link>
            </div>
          </div>

          <div className="flex gap-2">
            <ShareButton title={meeting.title} />
            <Link
              href="/town/groups"
              className="btn-secondary flex-1 rounded-xl p-3 text-center t-body no-underline"
            >
              목록
            </Link>
          </div>

          {myEmail ? (
            <>
              {/* [2026-08-22] "대기 참여" 문구 제거 — 대기 명단 기능은 어디에도
                  없다. 정원이 찬 모임의 신규 입장은 채팅에서 정원 오류가 나므로,
                  약속 없이 사실만 말한다(기존 참여자 재입장은 항상 허용됨). */}
              <Link
                href={`/town/groups/${id}/chat`}
                className={`${
                  isPast || (isFull && !isOrganizer) ? "btn-secondary" : "btn-primary"
                } rise-in-2 rounded-2xl p-3.5 text-center t-body no-underline`}
                style={
                  isPast || (isFull && !isOrganizer)
                    ? undefined
                    : { boxShadow: "0 10px 26px rgba(27, 75, 145,.35)" }
                }
              >
                {isOrganizer
                  ? "모임 채팅방 관리"
                  : role.member
                    ? "모임 채팅방 입장"
                  : isPast
                    ? "일정 종료 · 모임 채팅 보기"
                    : isFull
                      ? "모집 마감 · 참여했다면 채팅방 입장"
                      : "참여하기 → 채팅방 입장"}
              </Link>
              <p className="rise-in-3 text-center t-sub text-text-3">
                {isOrganizer
                  ? "내가 만든 모임이에요"
                  : role.member
                    ? "참여 중인 모임"
                  : isPast
                    ? "일정이 지난 모임이에요. 후기·정리는 채팅에서"
                    : isFull
                      ? "정원 마감 · 새 참여 없음"
                      : "채팅방 입장 시 모임 참여로 확정돼요"}
              </p>
            </>
          ) : (
            <>
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/town/groups/${id}`)}`}
                className="btn-primary rise-in-2 rounded-2xl p-3.5 text-center t-section no-underline"
                style={{ boxShadow: "0 10px 26px rgba(27, 75, 145,.35)" }}
              >
                로그인하고 참여하기
              </Link>
              <p className="rise-in-3 text-center t-sub text-text-3">
                로그인하면 모임 채팅에 참여할 수 있어요
              </p>
            </>
          )}
        </div>
      </div>
    </ShellNarrow>
  );
}
