// src/services/email/emailService.js
import { red } from "colorette";
import { otpTemplate, resetPasswordOtpTemplate } from "./emailTemplates/otpTemplate.email.js";
import { welcomeTemplate } from "./emailTemplates/welcomeTemplate.email.js";
import transporter from "../../config/nodemailer.config.js";


const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMailWithRetry(mailOptions, attempt = 1) {
  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(`Email send attempt ${attempt} failed:`, err.message);

    if (attempt < MAX_RETRIES) {
      await delay(RETRY_DELAY_MS * attempt);
      return sendMailWithRetry(mailOptions, attempt + 1);
    }

    console.error(
     red( `❌ Email permanently failed after ${MAX_RETRIES} attempts:`,
      {
        to: mailOptions.to,
        subject: mailOptions.subject,
        error: err.message,
      })
    );
    throw err;
  }
}
function buildMailOptions({ to, subject, html }) {
  return {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
  };
}

export async function sendWelcomeEmail(user, verifyUrl) {
  const html = welcomeTemplate({ name: user.name, verifyUrl });
  return sendMailWithRetry(
    buildMailOptions({
      to: user.email,
      subject: `Welcome — ${user.name}`,
      html,
    })
  );
}

export async function sendPasswordResetOtp(user, otp) {
  const html = resetPasswordOtpTemplate({ name: user.name, otp });
  return sendMailWithRetry(
    buildMailOptions({
      to: user.email,
      subject: "Your OTP code",
      html,
    })
  );
}
