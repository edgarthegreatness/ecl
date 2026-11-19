// Email through the owner's Gmail (SMTP + app password).
import nodemailer from "nodemailer";
import { env } from "./config.js";

let transport;
const getTransport = () =>
  (transport ||= nodemailer.createTransport({ service: "gmail", auth: { user: env("GMAIL_USER"), pass: env("GMAIL_APP_PASSWORD") } }));

export async function sendMail({ to, subject, text, replyTo, fromName }) {
  const user = env("GMAIL_USER");
  return getTransport().sendMail({ from: fromName ? `"${fromName.replace(/"/g, "")}" <${user}>` : user, to, subject, text, replyTo });
}

export const alert = (subject, text) => sendMail({ to: env("ALERT_EMAIL", env("GMAIL_USER")), subject, text, fromName: "Lead Desk" });
