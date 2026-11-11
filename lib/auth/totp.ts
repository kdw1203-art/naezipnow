import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* [1147 · 관리자 2단계 인증] 시간 기반 일회용 번호(TOTP · RFC 6238 · SHA-1 · 30초 · 6자리) — 인증 앱(Google Authenticator 등)과 맞는다.
   관리자 화면에 회원 정보(1141)가 생겨, 비밀번호 하나로 열리지 않게 한다.
   · 비밀값은 서버가 만들고(160비트) AUTH_SECRET 에서 뽑은 열쇠로 암호화해 DB 에 둔다(AES-256-GCM) — DB 만 새도 번호를 못 만든다.
   · 확인 표식(쿠키)은 이메일 + 만료를 AUTH_SECRET 으로 서명한 값(12시간). HttpOnly 라 화면 스크립트가 못 읽는다.
   node:crypto 만 쓴다(서버 전용 · 테스트가 그대로 부른다). */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;
export const ADMIN_2FA_COOKIE = "nz_admin_2fa";
export const ADMIN_2FA_TTL_SEC = 12 * 60 * 60;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 그 시각(초)의 6자리 번호 */
export function totpAt(secretB32: string, unixSec: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSec / TOTP_STEP_SEC)));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** 앞뒤 한 칸(±30초)까지 받는다 — 시계가 조금 어긋난 휴대전화. 숫자 6자리가 아니면 바로 거절 */
export function verifyTotp(secretB32: string, code: string, nowMs: number): boolean {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const now = Math.floor(nowMs / 1000);
  for (const d of [0, -1, 1]) {
    const exp = Buffer.from(totpAt(secretB32, now + d * TOTP_STEP_SEC));
    if (timingSafeEqual(exp, Buffer.from(c))) return true;
  }
  return false;
}

export function otpauthUrl(secretB32: string, email: string, issuer = "내집나우 관리자"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
}

function keyFrom(authSecret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${authSecret}`).digest();
}

/** DB 에 두는 꼴 — v1.<iv>.<tag>.<암호문>(base64url) */
export function sealSecret(secretB32: string, authSecret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(authSecret, "admin-totp"), iv);
  const enc = Buffer.concat([c.update(secretB32, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function openSecret(sealed: string, authSecret: string): string | null {
  const [v, iv, tag, enc] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !enc) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", keyFrom(authSecret, "admin-totp"), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** 확인 표식 — <만료 초>.<서명>. 이메일이 서명에 들어가 다른 계정에 쓸 수 없다 */
export function signAdmin2fa(email: string, authSecret: string, nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + ADMIN_2FA_TTL_SEC;
  const sig = createHmac("sha256", keyFrom(authSecret, "admin-2fa-cookie")).update(`${email.toLowerCase()}|${exp}`).digest("base64url");
  return `${exp}.${sig}`;
}

export function checkAdmin2fa(token: string | null | undefined, email: string, authSecret: string, nowMs: number): boolean {
  const [expRaw, sig] = (token ?? "").split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !sig || exp * 1000 <= nowMs) return false;
  const want = createHmac("sha256", keyFrom(authSecret, "admin-2fa-cookie")).update(`${email.toLowerCase()}|${exp}`).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return false;
  }
  return got.length === want.length && timingSafeEqual(got, want);
}
