// src/services/email/templates/resetPasswordOtpTemplate.js

export function resetPasswordOtpTemplate({ name, otp }) {
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
            <td style="background: linear-gradient(135deg, #f43f5e 0%, #ec4899 50%, #d946ef 100%); padding:48px 40px; text-align:center;">
              <div style="width:64px; height:64px; background:rgba(255,255,255,0.2); border-radius:50%; display:inline-block; line-height:64px; font-size:28px; margin-bottom:16px;">
                🔐
              </div>
              <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:700; letter-spacing:-0.5px;">
                Password Reset Request
              </h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:15px;">
                Use the code below to continue
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px; color:#1f2937; font-size:16px; line-height:1.6;">
                Hey ${name},
              </p>
              <p style="margin:0 0 32px; color:#4b5563; font-size:15px; line-height:1.7;">
                We received a request to reset your password. Enter the verification code below
                to proceed. This code is valid for a limited time only.
              </p>

              <!-- OTP Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#fdf2f8; border:1.5px dashed #f472b6; border-radius:14px; padding:24px 40px;">
                      <tr>
                        <td align="center">
                          <p style="margin:0 0 8px; color:#9d174d; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase;">
                            Your OTP Code
                          </p>
                          <p style="margin:0; color:#831843; font-size:38px; font-weight:800; letter-spacing:10px; font-family: 'Courier New', monospace;">
                            ${otp}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Expiry note -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background:#fffbeb; border-radius:10px; padding:14px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:24px; vertical-align:top; font-size:16px;">⏱️</td>
                        <td style="color:#92400e; font-size:13px; line-height:1.5; padding-left:6px;">
                          This code expires in <strong>10 minutes</strong>. Do not share it with anyone —
                          our team will never ask for your OTP.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0; color:#6b7280; font-size:13px; line-height:1.6;">
                Didn't request this? You can safely ignore this email — your password will remain unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fafafa; padding:24px 40px; text-align:center; border-top:1px solid #eef0f3;">
              <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.6;">
                For your security, never share this code with anyone.
              </p>
              <p style="margin:8px 0 0; color:#9ca3af; font-size:12px;">
                © ${new Date().getFullYear()} YourApp. All rights reserved.
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
