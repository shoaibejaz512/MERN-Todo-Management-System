import nodemailer from "nodemailer"

const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SENDER_EMAIL_ADDRESS,
    // pass://to be contine
  },
});