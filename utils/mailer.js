const nodemailer = require('nodemailer')

async function createTransporter() {
  // Allow configuration via environment variables
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (host && port && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465, // true for 465, false for other ports
      auth: { user, pass }
    })
  }

  // Fallback: use Ethereal test account
  const testAccount = await nodemailer.createTestAccount()
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass }
  })
}

async function sendMail({ to, subject, text, html, from }) {
  const transporter = await createTransporter()
  const fromAddr = from || process.env.FROM_EMAIL || 'no-reply@example.com'

  const info = await transporter.sendMail({
    from: fromAddr,
    to,
    subject,
    text,
    html
  })

  // If using Ethereal, return preview URL
  const preview = nodemailer.getTestMessageUrl(info)
  return { info, preview }
}

module.exports = { sendMail }
