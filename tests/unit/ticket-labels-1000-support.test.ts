import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_TONE,
  TICKET_MESSAGE_MAX,
  TICKET_SUBJECT_MAX,
  firstTicketError,
  formatTicketNo,
  isTicketCategory,
  isTicketStatus,
  validateTicketInput,
} from "@/lib/support/ticket-labels";
import { RESPONSE_TIME } from "@/lib/support/constants";
import { supportReplyEmail } from "@/lib/email/support-templates";

test("카테고리 6종 — 폼·API·관리자가 같은 배열을 본다", () => {
  assert.deepEqual(
    [...TICKET_CATEGORIES],
    ["일반 문의", "결제·환불", "버그 신고", "개인정보", "악성 콘텐츠 신고", "기타"],
  );
  for (const c of TICKET_CATEGORIES) assert.ok(isTicketCategory(c), c);
  assert.equal(isTicketCategory("환불"), false);
  assert.equal(isTicketCategory(null), false);
});

test("상태 3종 — DB CHECK(open|answered|closed) 와 같고 전부 한글 라벨·토큰 색", () => {
  assert.deepEqual([...TICKET_STATUSES], ["open", "answered", "closed"]);
  assert.equal(TICKET_STATUS_LABEL.open, "답변 대기");
  assert.equal(TICKET_STATUS_LABEL.answered, "답변 완료");
  assert.equal(TICKET_STATUS_LABEL.closed, "종료");
  for (const s of TICKET_STATUSES) {
    assert.ok(isTicketStatus(s));
    assert.doesNotMatch(TICKET_STATUS_TONE[s], /#[0-9a-f]{3,6}/i, "헥스 금지 — 토큰만");
  }
  assert.equal(isTicketStatus("pending"), false);
});

test("formatTicketNo — uuid 앞 8자리 hex 대문자, 하이픈 제거, 빈 값은 —", () => {
  assert.equal(formatTicketNo("3f2a9c10-1234-4abc-9def-0123456789ab"), "3F2A9C10");
  assert.equal(formatTicketNo("abcdef"), "ABCDEF");
  assert.equal(formatTicketNo(""), "—");
  assert.equal(formatTicketNo(null), "—");
  assert.equal(formatTicketNo(undefined), "—");
  /* 짧은 표시값은 조회 키가 아니다 — 같은 접두를 가진 두 id 가 같은 번호로 보일 수 있다 */
  assert.equal(formatTicketNo("3f2a9c10-aaaa"), formatTicketNo("3f2a9c10-bbbb"));
});

test("validateTicketInput — 정상 입력은 trim 된 값으로 통과", () => {
  const r = validateTicketInput({
    category: " 결제·환불 ",
    subject: "  환불 요청 ",
    message: "  결제 후 3일 지났는데 환불하고 싶어요.  ",
    email: " Me@Example.com ",
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value, {
      category: "결제·환불",
      subject: "환불 요청",
      message: "결제 후 3일 지났는데 환불하고 싶어요.",
      email: "Me@Example.com",
    });
  }
});

test("validateTicketInput — 항목별 오류를 모두 모아 돌려주고 첫 오류가 400 문구가 된다", () => {
  const r = validateTicketInput({ category: "없는 분류", subject: "a", message: "짧다", email: "nope" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.category);
    assert.ok(r.errors.subject);
    assert.ok(r.errors.message);
    assert.ok(r.errors.email);
    assert.equal(firstTicketError(r.errors), r.errors.category);
  }
  const onlyEmail = validateTicketInput({
    category: "기타",
    subject: "제목입니다",
    message: "열 글자 이상 되는 문의 본문입니다.",
    email: "",
  });
  assert.equal(onlyEmail.ok, false);
  if (!onlyEmail.ok) {
    assert.deepEqual(Object.keys(onlyEmail.errors), ["email"]);
    assert.match(firstTicketError(onlyEmail.errors), /이메일/);
  }
  assert.equal(firstTicketError({}), "입력을 확인해 주세요.");
});

test("validateTicketInput — 길이 상한은 폼 maxLength 와 같은 숫자", () => {
  const tooLongSubject = validateTicketInput({
    category: "기타",
    subject: "a".repeat(TICKET_SUBJECT_MAX + 1),
    message: "열 글자 이상 되는 문의 본문입니다.",
    email: "a@b.co",
  });
  assert.equal(tooLongSubject.ok, false);
  const maxOk = validateTicketInput({
    category: "기타",
    subject: "a".repeat(TICKET_SUBJECT_MAX),
    message: "b".repeat(TICKET_MESSAGE_MAX),
    email: "a@b.co",
  });
  assert.equal(maxOk.ok, true);
  /* 문자열이 아닌 값은 빈 값으로 취급 — 타입 우회로 통과하지 않는다 */
  const weird = validateTicketInput({ category: 1, subject: ["x"], message: {}, email: 5 });
  assert.equal(weird.ok, false);
});

test("RESPONSE_TIME — 한 곳의 문구(24~72시간)", () => {
  assert.match(RESPONSE_TIME, /24~72시간/);
});

test("supportReplyEmail — 제목에 접수번호, 본문은 이스케이프·줄바꿈, 내 문의 링크", () => {
  const m = supportReplyEmail({
    ticketNo: "3F2A9C10",
    subject: "<b>환불</b> 요청",
    reply: "안녕하세요.\n환불 처리했어요 & 감사합니다.",
    message: "결제 후 3일",
  });
  assert.match(m.subject, /3F2A9C10/);
  assert.match(m.subject, /환불/);
  assert.doesNotMatch(m.html, /<b>환불<\/b>/, "제목 HTML 은 이스케이프된다");
  assert.match(m.html, /&lt;b&gt;환불&lt;\/b&gt;/);
  assert.match(m.html, /안녕하세요\.<br \/>환불 처리했어요 &amp; 감사합니다\./);
  assert.match(m.html, /https:\/\/naezipnow\.com\/my\/support/);
  assert.match(m.html, /결제 후 3일/);
  assert.match(m.text, /내 문의 내역: https:\/\/naezipnow\.com\/my\/support/);
  assert.match(m.text, /안녕하세요\.\n환불 처리했어요 & 감사합니다\./);
  /* 원문 없이도 만들어진다 */
  const noMsg = supportReplyEmail({ ticketNo: "X", subject: "s", reply: "r" });
  assert.doesNotMatch(noMsg.html, /보내주신 문의/);
});
