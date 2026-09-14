import "server-only";
import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  isTicketCategory,
  isTicketStatus,
  type TicketCategory,
  type TicketStatus,
} from "@/lib/support/ticket-labels";

/**
 * [1000] 문의 티켓 저장소 — public.support_tickets (서비스롤 전용, 정책 0).
 *
 * 예전 흐름은 폼 → 관리자 인박스 알림 + 메일 한 통이 전부라, 사용자는 자기가 무엇을
 * 물었는지 다시 볼 수 없었고 운영자는 답을 메일에서만 달았다. 이제 접수 자체가 행이
 * 되고, 답변도 같은 행에 붙는다(/my/support · /admin/support).
 *
 * 규칙:
 *  - 읽기·쓰기 모두 **던지지 않는다**. 실패는 null / [] 로 돌리고 logger 에 남긴다.
 *    접수 API 는 DB 가 죽어도 메일·알림 경로로 문의를 살려야 하기 때문이다.
 *  - 사용자 조회는 항상 user_email 로 좁힌다(남의 티켓을 id 만으로 볼 수 없다).
 *  - Supabase 미설정(로컬)은 메모리 저장소 — inbox.ts 와 같은 태도.
 */

export type SupportTicket = {
  id: string;
  createdAt: string;
  updatedAt: string;
  userEmail: string | null;
  contactEmail: string;
  category: TicketCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  adminReply: string | null;
  repliedAt: string | null;
  repliedBy: string | null;
  metadata: Record<string, unknown>;
};

const SELECT =
  "id, created_at, updated_at, user_email, contact_email, category, subject, message, status, admin_reply, replied_at, replied_by, metadata";

function normEmail(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return v || null;
}

function rowToTicket(r: Record<string, unknown>): SupportTicket | null {
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  const category = isTicketCategory(r.category) ? r.category : "기타";
  const status = isTicketStatus(r.status) ? r.status : "open";
  const metadata =
    r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
      ? (r.metadata as Record<string, unknown>)
      : {};
  return {
    id,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? r.created_at ?? ""),
    userEmail: typeof r.user_email === "string" ? r.user_email : null,
    contactEmail: String(r.contact_email ?? ""),
    category,
    subject: String(r.subject ?? ""),
    message: String(r.message ?? ""),
    status,
    adminReply: typeof r.admin_reply === "string" ? r.admin_reply : null,
    repliedAt: typeof r.replied_at === "string" ? r.replied_at : null,
    repliedBy: typeof r.replied_by === "string" ? r.replied_by : null,
    metadata,
  };
}

/* ── 로컬(미설정) 메모리 저장소 ────────────────────────────────────────── */
const memory: SupportTicket[] = [];

function memSorted(): SupportTicket[] {
  return [...memory].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ── 생성 ─────────────────────────────────────────────────────────────── */
export async function createSupportTicket(input: {
  userEmail?: string | null;
  contactEmail: string;
  category: TicketCategory;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<SupportTicket | null> {
  const userEmail = normEmail(input.userEmail);
  const contactEmail = normEmail(input.contactEmail);
  if (!contactEmail) return null;
  const sb = getServiceSupabase();
  if (!sb) {
    const now = new Date().toISOString();
    const row: SupportTicket = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userEmail,
      contactEmail,
      category: input.category,
      subject: input.subject,
      message: input.message,
      status: "open",
      adminReply: null,
      repliedAt: null,
      repliedBy: null,
      metadata: input.metadata ?? {},
    };
    memory.unshift(row);
    return row;
  }
  try {
    const { data, error } = await sb
      .from("support_tickets")
      .insert({
        user_email: userEmail,
        contact_email: contactEmail,
        category: input.category,
        subject: input.subject,
        message: input.message,
        status: "open",
        metadata: input.metadata ?? {},
      })
      .select(SELECT)
      .single();
    if (error) {
      logger.error("[support/tickets] insert 실패:", error.message);
      return null;
    }
    return data ? rowToTicket(data as Record<string, unknown>) : null;
  } catch (e) {
    logger.error("[support/tickets] insert 예외:", e);
    return null;
  }
}

/* ── 사용자 조회 ──────────────────────────────────────────────────────── */
export async function listMyTickets(userEmail: string, limit = 50): Promise<SupportTicket[]> {
  const email = normEmail(userEmail);
  if (!email) return [];
  const sb = getServiceSupabase();
  if (!sb) return memSorted().filter((t) => t.userEmail === email).slice(0, limit);
  try {
    const { data, error } = await sb
      .from("support_tickets")
      .select(SELECT)
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      logger.error("[support/tickets] 내 문의 조회 실패:", error.message);
      return [];
    }
    return (Array.isArray(data) ? data : [])
      .map((r) => rowToTicket(r as Record<string, unknown>))
      .filter((t): t is SupportTicket => t !== null);
  } catch (e) {
    logger.error("[support/tickets] 내 문의 조회 예외:", e);
    return [];
  }
}

export async function getMyTicket(id: string, userEmail: string): Promise<SupportTicket | null> {
  const email = normEmail(userEmail);
  const key = id.trim();
  if (!email || !key) return null;
  const sb = getServiceSupabase();
  if (!sb) return memory.find((t) => t.id === key && t.userEmail === email) ?? null;
  try {
    const { data, error } = await sb
      .from("support_tickets")
      .select(SELECT)
      .eq("id", key)
      .eq("user_email", email)
      .maybeSingle();
    if (error) {
      logger.error("[support/tickets] 단건 조회 실패:", error.message);
      return null;
    }
    return data ? rowToTicket(data as Record<string, unknown>) : null;
  } catch (e) {
    logger.error("[support/tickets] 단건 조회 예외:", e);
    return null;
  }
}

/* ── 관리자 조회 ──────────────────────────────────────────────────────── */
export type AdminTicketList = {
  tickets: SupportTicket[];
  /** 조회 자체가 실패했는가 — 실패를 "문의 없음"으로 그리지 않기 위해 구분한다 */
  failed: boolean;
};

export async function listTicketsForAdmin(opts: {
  status?: TicketStatus;
  limit?: number;
} = {}): Promise<AdminTicketList> {
  const limit = opts.limit ?? 100;
  const sb = getServiceSupabase();
  if (!sb) {
    const rows = memSorted().filter((t) => !opts.status || t.status === opts.status);
    return { tickets: rows.slice(0, limit), failed: false };
  }
  try {
    let q = sb.from("support_tickets").select(SELECT);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) {
      logger.error("[support/tickets] 관리자 목록 조회 실패:", error.message);
      return { tickets: [], failed: true };
    }
    return {
      tickets: (Array.isArray(data) ? data : [])
        .map((r) => rowToTicket(r as Record<string, unknown>))
        .filter((t): t is SupportTicket => t !== null),
      failed: false,
    };
  } catch (e) {
    logger.error("[support/tickets] 관리자 목록 조회 예외:", e);
    return { tickets: [], failed: true };
  }
}

/* ── 답변 ─────────────────────────────────────────────────────────────── */
export async function replyToTicket(input: {
  id: string;
  reply: string;
  repliedBy: string;
}): Promise<SupportTicket | null> {
  const key = input.id.trim();
  const reply = input.reply.trim();
  if (!key || !reply) return null;
  const now = new Date().toISOString();
  const repliedBy = normEmail(input.repliedBy) ?? "admin";
  const sb = getServiceSupabase();
  if (!sb) {
    const i = memory.findIndex((t) => t.id === key);
    if (i < 0) return null;
    memory[i] = {
      ...memory[i],
      status: "answered",
      adminReply: reply,
      repliedAt: now,
      repliedBy,
      updatedAt: now,
    };
    return memory[i];
  }
  try {
    const { data, error } = await sb
      .from("support_tickets")
      .update({
        status: "answered",
        admin_reply: reply,
        replied_at: now,
        replied_by: repliedBy,
        updated_at: now,
      })
      .eq("id", key)
      .select(SELECT)
      .maybeSingle();
    if (error) {
      logger.error("[support/tickets] 답변 저장 실패:", error.message);
      return null;
    }
    return data ? rowToTicket(data as Record<string, unknown>) : null;
  } catch (e) {
    logger.error("[support/tickets] 답변 저장 예외:", e);
    return null;
  }
}

/* ── 종료 ─────────────────────────────────────────────────────────────── */
/**
 * byUser 를 주면 **그 사용자의 티켓일 때만** 닫힌다(소유자 검사). 관리자는 생략.
 */
export async function closeTicket(input: {
  id: string;
  byUser?: string | null;
}): Promise<SupportTicket | null> {
  const key = input.id.trim();
  if (!key) return null;
  const owner = normEmail(input.byUser);
  const now = new Date().toISOString();
  const sb = getServiceSupabase();
  if (!sb) {
    const i = memory.findIndex((t) => t.id === key && (!owner || t.userEmail === owner));
    if (i < 0) return null;
    memory[i] = { ...memory[i], status: "closed", updatedAt: now };
    return memory[i];
  }
  try {
    let q = sb
      .from("support_tickets")
      .update({ status: "closed", updated_at: now })
      .eq("id", key);
    if (owner) q = q.eq("user_email", owner);
    const { data, error } = await q.select(SELECT).maybeSingle();
    if (error) {
      logger.error("[support/tickets] 종료 실패:", error.message);
      return null;
    }
    return data ? rowToTicket(data as Record<string, unknown>) : null;
  } catch (e) {
    logger.error("[support/tickets] 종료 예외:", e);
    return null;
  }
}
