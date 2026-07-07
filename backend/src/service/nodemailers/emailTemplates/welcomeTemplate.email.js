// src/services/email/templates/welcomeTemplate.js

export function welcomeTemplate({ name }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header / Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); padding:48px 40px; text-align:center;">
              <div style="width:64px; height:64px; background:rgba(255,255,255,0.2); border-radius:50%; display:inline-block; line-height:64px; font-size:28px; margin-bottom:16px;">
                🎉
              </div>
              <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:700; letter-spacing:-0.5px;">
                You're in, ${name}!
              </h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:15px;">
                Welcome to the community
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px; color:#1f2937; font-size:16px; line-height:1.6;">
                Hey ${name},
              </p>
              <p style="margin:0 0 24px; color:#4b5563; font-size:15px; line-height:1.7;">
                Your account is all set up and ready to go. We're genuinely excited to have you here —
                let's get you started with everything you need to make the most of it.
              </p>
              <!-- Feature highlights -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef0f3; padding-top:24px; margin-top:8px;">
                <tr>
                  <td style="padding:12px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:36px; vertical-align:top; font-size:20px;">⚡</td>
                        <td style="color:#374151; font-size:14px; line-height:1.5; padding-left:8px;">
                          <strong style="color:#1f2937;">Quick setup</strong><br/>
                          <span style="color:#6b7280;">Jump right in — no complicated onboarding.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:36px; vertical-align:top; font-size:20px;">🔒</td>
                        <td style="color:#374151; font-size:14px; line-height:1.5; padding-left:8px;">
                          <strong style="color:#1f2937;">Secure by default</strong><br/>
                          <span style="color:#6b7280;">Your data is protected with industry best practices.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:36px; vertical-align:top; font-size:20px;">💬</td>
                        <td style="color:#374151; font-size:14px; line-height:1.5; padding-left:8px;">
                          <strong style="color:#1f2937;">We're here to help</strong><br/>
                          <span style="color:#6b7280;">Reach out anytime — we reply fast.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafafa; padding:24px 40px; text-align:center; border-top:1px solid #eef0f3;">
              <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.6;">
                If you didn't create this account, you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0; color:#9ca3af; font-size:12px;">
                © ${new Date().getFullYear()} smart_todo_system. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
