"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { ActionButton } from "@/app/components/ui/ActionButton";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import {
  BUSINESS_FORMS,
  DOC_KINDS,
  EXPERT_TYPES,
  SPECIALTIES,
  allowedBusinessForms,
  docKindLabel,
  missingDocsMessage,
  requiredDocKinds,
  type BusinessFormId,
  type DocKind,
  type ExpertTypeId,
} from "@/lib/experts/taxonomy";
import { EXPERT_DOC_MAX_BYTES, EXPERT_DOC_MAX_FILES, formatDocSize, type ExpertDocFile } from "@/lib/experts/doc-limits";
import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";

/* [1047] 전문가 등록 — 소유자 지시(2026-10-09): 개인·법인 등 다양한 직업군 · 면허증·사업자등록증 첨부 → 관리자 승인만 등록.
   예전 등록은 모달 안의 짧은 양식이었고 증빙은 "https 주소"만 받았다(서류를 어디에 올려 주소를 만들지 신청자가 알아서).
   이제 한 화면 양식 + 파일 첨부. 첨부는 고르는 즉시 비공개 저장소(expert-docs)의 내 폴더로 올라가고, 신청서에는 경로만 붙는다.
   직업군 · 사업 형태 · 필요 서류는 lib/experts/taxonomy 한 곳이 정한다(서버도 같은 규칙으로 다시 본다). */

type Phase = "idle" | "sending" | "done";

const CERT_NUMBER_RE = /^제?[0-9A-Za-z가-힣]{1,12}(-[0-9A-Za-z가-힣]{1,12}){1,3}호?$/;
const BIZ_NO_RE = /^\d{3}-?\d{2}-?\d{5}$/;

const inputCls =
  "w-full rounded-xl border border-line bg-bg p-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 t-sub font-bold text-text-2">
      {children}
      {hint && <span className="ml-1 font-normal text-text-3">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 rounded-2xl p-4 sm:p-5">
      <h2 className="t-section text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function ApplyForm() {
  const { promptSignup } = useSoftSignup();
  const [typeId, setTypeId] = useState<ExpertTypeId>("tax");
  const [formId, setFormId] = useState<BusinessFormId>("individual");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [bizNo, setBizNo] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [city, setCity] = useState<string>("서울특별시");
  const [district, setDistrict] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [yearsExp, setYearsExp] = useState("");
  const [bio, setBio] = useState("");
  const [docs, setDocs] = useState<ExpertDocFile[]>([]);
  const [uploading, setUploading] = useState<DocKind | null>(null);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<DocKind>("license");

  const type = EXPERT_TYPES.find((t) => t.id === typeId)!;
  const forms = allowedBusinessForms(typeId);
  const effectiveForm: BusinessFormId = forms.includes(formId) ? formId : forms[0];
  const required = requiredDocKinds(typeId, effectiveForm);
  const districts = (DISTRICTS as Record<string, string[]>)[city] ?? [];
  const isOtherCity = city === "기타(전국)";
  const suggested = useMemo(
    () => [...SPECIALTIES].sort((a, b) => Number(b.types.includes(typeId)) - Number(a.types.includes(typeId))),
    [typeId],
  );

  const toggleSpecialty = (label: string) =>
    setSpecialties((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : prev.length >= 6 ? prev : [...prev, label]));

  const askLogin = () =>
    promptSignup({
      action: "expert_register",
      title: "전문가 등록",
      benefit: "등록 신청과 서류는 계정에 연결해서 받아요. 심사 결과는 알림으로 보내 드려요.",
      callbackUrl: "/town/experts/apply",
    });

  const pickFile = (kind: DocKind) => {
    pendingKind.current = kind;
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (docs.length >= EXPERT_DOC_MAX_FILES) return setError(`첨부는 ${EXPERT_DOC_MAX_FILES}개까지예요.`);
    if (file.size > EXPERT_DOC_MAX_BYTES) return setError("파일 하나는 10MB 이하여야 해요.");
    const kind = pendingKind.current;
    setUploading(kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/experts/documents", { method: "POST", body: fd });
      if (res.status === 401) {
        askLogin();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { file?: ExpertDocFile; error?: string };
      if (!res.ok || !data.file) {
        setError(data.error ?? "올리기 실패 · 잠시 후 다시");
        return;
      }
      setDocs((prev) => [...prev, data.file!]);
    } catch {
      setError("올리기 실패 · 네트워크를 확인해 주세요.");
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeDoc = (path: string) => {
    setDocs((prev) => prev.filter((d) => d.path !== path));
    void fetch(`/api/experts/documents?path=${encodeURIComponent(path)}`, { method: "DELETE" }).catch(() => undefined);
  };

  const submit = async () => {
    const cityValue = isOtherCity ? customCity.trim() : city;
    if (name.trim().length < 2) return setError("대표자명(실명)을 입력해 주세요.");
    if (effectiveForm === "corporation" && businessName.trim().length < 2) return setError("법인명을 입력해 주세요.");
    if (effectiveForm !== "individual" && !BIZ_NO_RE.test(bizNo.replace(/\s+/g, ""))) {
      return setError("사업자등록번호 10자리를 입력해 주세요. (예: 123-45-67890)");
    }
    const cert = certNumber.trim().replace(/\s+/g, "");
    if (cert && !CERT_NUMBER_RE.test(cert)) return setError("등록·자격번호 형식을 확인해 주세요. (예: 제11-1234호)");
    if (type.source && typeId !== "builder" && !cert) {
      return setError(`${type.label}는 ${type.source.label} 조회를 위해 등록·자격번호가 필요해요.`);
    }
    if (!cityValue) return setError("주 활동 지역(시/도)을 골라 주세요.");
    if (bio.trim().length < 20) return setError("소개는 20자 이상 입력해 주세요.");
    const gap = missingDocsMessage(typeId, effectiveForm, docs.map((d) => d.kind));
    if (gap) return setError(gap);
    if (!agree) return setError("전문가 운영정책과 서류 심사에 동의해 주세요.");
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/experts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertType: type.label,
          applicantKind: effectiveForm,
          businessName: businessName.trim() || null,
          businessRegNo: effectiveForm !== "individual" ? bizNo.replace(/\s+/g, "") : null,
          name: name.trim(),
          organization: businessName.trim() || null,
          city: cityValue,
          district: district.trim(),
          bio: bio.trim(),
          certNumber: cert || null,
          specialties: specialties.slice(0, 8),
          yearsExp: Math.max(0, Math.min(60, Number(yearsExp) || 0)),
          documents: docs,
          consent: { terms: true },
        }),
      });
      if (res.status === 401) {
        setPhase("idle");
        askLogin();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setError(
          data.code === "application_pending"
            ? "이미 심사 중인 신청이 있어요. 진행 상태는 마이 › 전문가 프로필에서 볼 수 있어요."
            : (data.error ?? "접수 실패 · 잠시 후 다시"),
        );
        setPhase("idle");
        return;
      }
      setPhase("done");
    } catch {
      setError("접수 실패 · 네트워크를 확인해 주세요.");
      setPhase("idle");
    }
  };

  if (phase === "done") {
    return (
      <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-5 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="shield" size={24} />
        </div>
        <div className="t-section text-ink">등록 신청 접수 완료</div>
        <p className="t-sub text-text-2">
          운영자가 서류와 {type.source ? `${type.source.label} 등록 상태` : "제출 내용"}를 확인한 뒤 승인 여부를 알림으로 보내 드려요.
          <br />
          승인되면 이름 옆과 글 머리에 &lsquo;인증 {type.label}&rsquo; 마크가 붙고, 전문가 찾기 · 분야별 목록에 무료로 실려요.
        </p>
        <Link href="/my/expert-profile" className="btn-soft mt-1 rounded-xl px-5 py-2.5 t-body no-underline">
          진행 상태 보기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <Section title="1. 직업군과 사업 형태">
        <div>
          <Label>직업군</Label>
          <div className="flex flex-wrap gap-1.5">
            {EXPERT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeId(t.id)}
                aria-pressed={typeId === t.id}
                className={`chip min-h-10 px-3 t-sub font-bold ${typeId === t.id ? "chip-active" : "border border-line bg-bg text-text-2"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 t-caption text-text-3">
            {type.desc}
            {type.source ? ` · 자격 확인: ${type.source.label} (${type.source.searchHint})` : " · 서류·인터뷰로 확인"}
          </p>
        </div>
        <div>
          <Label>사업 형태</Label>
          <div className="flex flex-wrap gap-1.5">
            {BUSINESS_FORMS.filter((f) => forms.includes(f.id)).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormId(f.id)}
                aria-pressed={effectiveForm === f.id}
                className={`chip min-h-10 px-3 t-sub font-bold ${effectiveForm === f.id ? "chip-active" : "border border-line bg-bg text-text-2"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 t-caption text-text-3">{BUSINESS_FORMS.find((f) => f.id === effectiveForm)?.desc}</p>
        </div>
      </Section>

      <Section title="2. 기본 정보">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label>대표자명 (실명)</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="홍길동" className={inputCls} />
          </div>
          <div>
            <Label hint={effectiveForm === "corporation" ? "" : "(선택)"}>{effectiveForm === "corporation" ? "법인명" : "상호 · 사무소명"}</Label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={60} placeholder={effectiveForm === "corporation" ? "예: 주식회사 내집건설" : "예: 관양세무회계"} className={inputCls} />
          </div>
          {effectiveForm !== "individual" && (
            <div>
              <Label>사업자등록번호</Label>
              <input value={bizNo} onChange={(e) => setBizNo(e.target.value.replace(/[^0-9-]/g, ""))} maxLength={12} inputMode="numeric" placeholder="123-45-67890" className={inputCls} />
            </div>
          )}
          <div>
            <Label hint={type.source && typeId !== "builder" ? "" : "(선택)"}>{typeId === "builder" ? "건설업 등록번호" : "등록 · 자격번호"}</Label>
            <input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} maxLength={40} placeholder="예: 제11-1234호" className={inputCls} />
          </div>
          <div>
            <Label>경력 (년)</Label>
            <input value={yearsExp} onChange={(e) => setYearsExp(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" maxLength={2} placeholder="예: 8" aria-label="경력 (년)" className={inputCls} />
          </div>
        </div>
        <div>
          <Label>주 활동 지역</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setDistrict("");
              }}
              aria-label="시/도"
              className={inputCls}
            >
              {CITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {isOtherCity ? (
              <input value={customCity} onChange={(e) => setCustomCity(e.target.value)} maxLength={20} placeholder="시/도 (예: 대전광역시)" className={inputCls} />
            ) : (
              <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="시·군·구" className={inputCls}>
                <option value="">시·군·구 (선택)</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div>
          <Label hint="최대 6개">전문 분야</Label>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((s) => {
              const on = specialties.includes(s.label);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecialty(s.label)}
                  aria-pressed={on}
                  className={`${on ? "chip-check-active" : "chip-check"} min-h-10 px-2.5 t-sub`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label hint="20자 이상 · 프로필 소개가 돼요">소개</Label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="어떤 일을 맡는지, 어떻게 진행하는지 적어 주세요. 예: 동안구 구축 아파트 양도세·취득세를 실거래 기준으로 계산해 드립니다."
            className={`${inputCls} resize-none`}
          />
        </div>
      </Section>

      <Section title="3. 서류 첨부">
        <p className="t-sub text-text-2">
          운영자만 열어 봅니다(공개되지 않음). 사진(JPG·PNG·WEBP) 또는 PDF · 한 장 10MB 이하. 주민등록번호 뒷자리는 가리고 올려 주세요.
        </p>
        <ul className="flex flex-col gap-2">
          {DOC_KINDS.map((k) => {
            const mine = docs.filter((d) => d.kind === k.id);
            const need = required.includes(k.id);
            return (
              <li key={k.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="t-body font-bold text-ink">
                      {k.label}
                      <span className={`ml-1.5 t-caption font-bold ${need ? "text-danger" : "text-text-3"}`}>{need ? "필수" : "선택"}</span>
                    </div>
                    <div className="t-caption text-text-3">{k.hint}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => pickFile(k.id)}
                    disabled={uploading !== null}
                    className="btn-soft min-h-10 rounded-xl px-3 t-sub font-bold disabled:opacity-60"
                  >
                    {uploading === k.id ? "올리는 중…" : "파일 고르기"}
                  </button>
                </div>
                {mine.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {mine.map((d) => (
                      <li key={d.path} className="flex items-center justify-between gap-2 t-sub text-text-2">
                        <span className="min-w-0 truncate">
                          <Icon name="check" size={12} className="mr-1 inline text-success" />
                          {d.name} · {formatDocSize(d.size)}
                        </span>
                        <button type="button" onClick={() => removeDoc(d.path)} className="min-h-10 shrink-0 px-2 t-caption font-bold text-text-3" aria-label={`${d.name} 빼기`}>
                          빼기
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="t-caption text-text-3">
          이 직업군 · 형태에서 필수: {required.length > 0 ? required.map(docKindLabel).join(" · ") : "서류 하나 이상"}
        </p>
      </Section>

      <label className="flex items-start gap-2 t-sub text-text-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
        <span>
          <Link href="/legal/expert" className="font-bold text-primary" target="_blank">
            전문가 운영정책
          </Link>{" "}
          과 서류 심사에 동의합니다. 허위 기재 · 플랫폼 밖 결제 유도 시 승인이 거부되거나 인증이 정지돼요.
        </span>
      </label>

      {error && <div className="t-sub font-semibold text-danger">{error}</div>}

      <ActionButton
        state={phase === "sending" ? "busy" : error ? "error" : "idle"}
        onClick={() => void submit()}
        busyLabel="접수 중"
        errorLabel="다시 확인해 주세요"
        className="rounded-xl p-3 t-body"
      >
        등록 신청하기
      </ActionButton>
      <p className="t-caption text-text-3">관리자 승인 전에는 목록 · 인증 마크에 나오지 않아요 · 계좌번호 같은 정산 정보는 적지 마세요</p>
    </div>
  );
}
