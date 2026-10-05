export function updateEmailOtpTemplate({ name, otp }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
</head>

<body
  style="
    margin:0;
    padding:0;
    background-color:#f0f2f5;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
    Roboto,Helvetica,Arial,sans-serif;
  "
>
  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="
      background-color:#f0f2f5;
      padding:40px 20px;
    "
  >
    <tr>
      <td align="center">

        <table
          role="presentation"
          width="100%"
          style="
            max-width:560px;
            background:#ffffff;
            border-radius:16px;
            overflow:hidden;
            box-shadow:0 4px 24px rgba(0,0,0,0.06);
          "
        >

          <!-- Header -->
          <tr>
            <td
              style="
                background:linear-gradient(
                  135deg,
                  #6366f1 0%,
                  #8b5cf6 50%,
                  #ec4899 100%
                );
                padding:48px 40px;
                text-align:center;
              "
            >
              <div
                style="
                  width:64px;
                  height:64px;
                  background:rgba(255,255,255,0.2);
                  border-radius:50%;
                  display:inline-block;
                  line-height:64px;
                  font-size:28px;
                  margin-bottom:16px;
                "
              >
                🔐
              </div>

              <h1
                style="
                  margin:0;
                  color:#ffffff;
                  font-size:26px;
                  font-weight:700;
                  letter-spacing:-0.5px;
                "
              >
                Verify Your Email
              </h1>

              <p
                style="
                  margin:8px 0 0;
                  color:rgba(255,255,255,0.85);
                  font-size:15px;
                "
              >
                Confirm your email address
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">

              <p
                style="
                  margin:0 0 16px;
                  color:#1f2937;
                  font-size:16px;
                  line-height:1.6;
                "
              >
                Hey ${name},
              </p>

              <p
                style="
                  margin:0 0 24px;
                  color:#4b5563;
                  font-size:15px;
                  line-height:1.7;
                "
              >
                We received a request to update the email address
                associated with your account. Please use the
                verification code below to confirm this change.
              </p>

              <!-- OTP Box -->
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                  background:#f8f7ff;
                  border:1px solid #e5e7eb;
                  border-radius:12px;
                  margin:24px 0;
                "
              >
                <tr>
                  <td
                    align="center"
                    style="padding:28px 20px;"
                  >

                    <p
                      style="
                        margin:0 0 10px;
                        color:#6b7280;
                        font-size:13px;
                        font-weight:600;
                        text-transform:uppercase;
                        letter-spacing:1px;
                      "
                    >
                      Verification Code
                    </p>

                    <div
                      style="
                        color:#4f46e5;
                        font-size:36px;
                        font-weight:700;
                        letter-spacing:8px;
                      "
                    >
                      ${otp}
                    </div>

                  </td>
                </tr>
              </table>

              <p
                style="
                  margin:0;
                  color:#4b5563;
                  font-size:14px;
                  line-height:1.7;
                  text-align:center;
                "
              >
                This code will expire in
                <strong style="color:#1f2937;">
                  5 minutes
                </strong>.
              </p>

              <!-- Security Notice -->
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                  margin-top:28px;
                  border-top:1px solid #eef0f3;
                  padding-top:24px;
                "
              >
                <tr>
                  <td>

                    <p
                      style="
                        margin:0;
                        color:#6b7280;
                        font-size:13px;
                        line-height:1.6;
                      "
                    >
                      🔒 <strong style="color:#374151;">
                        Security notice:
                      </strong>
                      Never share this verification code with
                      anyone, including FlowDo support.
                    </p>

                  </td>
                </tr>
              </table>

              <p
                style="
                  margin:24px 0 0;
                  color:#9ca3af;
                  font-size:13px;
                  line-height:1.6;
                "
              >
                If you didn't request an email address change,
                you can safely ignore this email.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td
              style="
                background:#fafafa;
                padding:24px 40px;
                text-align:center;
                border-top:1px solid #eef0f3;
              "
            >

              <p
                style="
                  margin:0;
                  color:#9ca3af;
                  font-size:12px;
                  line-height:1.6;
                "
              >
                This is an automated security email.
                Please do not reply to this message.
              </p>

              <p
                style="
                  margin:8px 0 0;
                  color:#9ca3af;
                  font-size:12px;
                "
              >
                © ${new Date().getFullYear()}
                smart_todo_system. All rights reserved.
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
