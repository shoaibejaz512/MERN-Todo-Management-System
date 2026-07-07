// src/services/email/transporter.js
import nodemailer from "nodemailer";
import { green, red } from "colorette";

console.log("HOST:", process.env.BREVO_SMTP_HOST);
console.log("PORT:", process.env.BREVO_SMTP_PORT);
console.log("USER:", process.env.BREVO_SMTP_USER);

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: Number(process.env.BREVO_SMTP_PORT),
  secure: false, // false for port 587 (STARTTLS)
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
  pool: true,
});

// Fail fast on boot if credentials are wrong
transporter.verify((err) => {
  if (err) {
    console.error(red(`❌ SMTP connection failed: ${err.message}`));
  } else {
    console.log(green("✅ SMTP transporter ready"));
  }
});

export default transporter;