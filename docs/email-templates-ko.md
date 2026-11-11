# 인증 메일 한국어 문구 (Supabase › Authentication › Email Templates 에 붙여 넣기)

## Confirm signup
제목: `[내집나우] 이메일 인증을 완료해 주세요`

```html
<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f1b2d">
  <p style="font-size:18px;font-weight:700;margin:0 0 12px">내집나우 이메일 인증</p>
  <p style="font-size:14px;line-height:1.6;margin:0 0 20px">아래 단추를 누르면 가입이 끝납니다. 링크는 한 번만 쓸 수 있습니다.</p>
  <p style="margin:0 0 20px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1f4fd8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">이메일 인증하기</a></p>
  <p style="font-size:12px;line-height:1.6;color:#6b7687;margin:0">가입한 적이 없다면 이 메일은 무시해도 됩니다. · 내집나우 naezipnow.com</p>
</div>
```

## Reset password
제목: `[내집나우] 비밀번호 다시 설정`

```html
<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f1b2d">
  <p style="font-size:18px;font-weight:700;margin:0 0 12px">비밀번호 다시 설정</p>
  <p style="font-size:14px;line-height:1.6;margin:0 0 20px">아래 단추를 눌러 새 비밀번호를 정합니다. 링크는 한 번만 쓸 수 있습니다.</p>
  <p style="margin:0 0 20px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1f4fd8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">비밀번호 다시 설정</a></p>
  <p style="font-size:12px;line-height:1.6;color:#6b7687;margin:0">요청한 적이 없다면 이 메일은 무시해도 됩니다. · 내집나우 naezipnow.com</p>
</div>
```
