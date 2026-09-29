import type { MailMessage } from './mailer';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

interface DoctorCodeEmail {
  to: string;
  displayName: string;
  code: string;
  expiresInMinutes: number;
}

/** Bilingual (Arabic first) because staff may read either language. */
export function doctorVerificationEmail({
  to,
  displayName,
  code,
  expiresInMinutes,
}: DoctorCodeEmail): MailMessage {
  const name = escapeHtml(displayName);

  const text = [
    `مرحبًا ${displayName}،`,
    `رمز تأكيد بريدك الجامعي على منصة ACU للغات هو: ${code}`,
    `ينتهي الرمز خلال ${expiresInMinutes} دقائق. إذا لم تطلب هذا الرمز فتجاهل الرسالة.`,
    '',
    `Hello ${displayName},`,
    `Your ACU Languages university email code is: ${code}`,
    `It expires in ${expiresInMinutes} minutes. If you did not ask for it, ignore this email.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;background:#f7f8fa;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#161a22">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dde1e8;border-radius:10px">
      <tr><td style="padding:28px">
        <p style="margin:0 0 12px;font-size:16px">مرحبًا ${name}،</p>
        <p style="margin:0 0 20px;font-size:16px">رمز تأكيد بريدك الجامعي على منصة ACU للغات:</p>
        <p dir="ltr" style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;color:#174593">${code}</p>
        <p style="margin:0 0 24px;font-size:14px;color:#4f5868">ينتهي الرمز خلال ${expiresInMinutes} دقائق. إذا لم تطلب هذا الرمز فتجاهل الرسالة.</p>
        <hr style="border:none;border-top:1px solid #dde1e8;margin:0 0 24px">
        <div dir="ltr" lang="en" style="text-align:left">
          <p style="margin:0 0 12px;font-size:16px">Hello ${name},</p>
          <p style="margin:0 0 12px;font-size:16px">Your ACU Languages university email code is <strong>${code}</strong>.</p>
          <p style="margin:0;font-size:14px;color:#4f5868">It expires in ${expiresInMinutes} minutes. If you did not ask for it, ignore this email.</p>
        </div>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    to,
    subject: `رمز التأكيد ${code} | Verification code`,
    text,
    html,
  };
}
