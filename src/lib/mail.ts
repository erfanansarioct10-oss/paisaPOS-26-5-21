import nodemailer from "nodemailer";

const getTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn("SMTP credentials not fully configured. Email sending might fail.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  });
};

export async function sendVerificationEmail(email: string, fullName: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verificationLink = `${appUrl}/auth/verify?token=${token}`;

  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || "chlorifofficial@gmail.com";

  const mailOptions = {
    from: `"Chlorif" <${from}>`,
    to: email,
    subject: "Verify your Email - Chlorif",
    text: `Welcome to Chlorif, ${fullName}!\n\nThank you for registering your store. To complete your setup and verify your email address, please copy and paste the following URL into your web browser:\n\n${verificationLink}\n\nThis link is valid for 24 hours. If you did not sign up for a Chlorif account, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 30px 20px; color: #334155; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="font-size: 24px; font-weight: 800; color: #4f46e5; margin: 0;">Chlorif</h2>
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 2px 0 0 0;">Nepali Boutique Sync</p>
        </div>
        
        <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome, ${fullName}!</h3>
        <p style="font-size: 14px; line-height: 1.5; color: #334155; margin-bottom: 20px;">
          Thank you for registering your store. Please verify your email address by clicking the link below:
        </p>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="${verificationLink}" style="display: inline-block; padding: 12px 28px; background-color: #4f46e5; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 6px;">
            Verify Email Address
          </a>
        </div>
        
        <p style="font-size: 12px; line-height: 1.4; color: #64748b; margin-bottom: 20px;">
          Or copy and paste this URL into your browser:
          <br />
          <a href="${verificationLink}" style="color: #4f46e5; word-break: break-all;">${verificationLink}</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        
        <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0;">
          This link is valid for 24 hours. If you did not sign up for a Chlorif account, please ignore this email.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

export async function sendPasswordResetOtpEmail(email: string, code: string) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || "chlorifofficial@gmail.com";

  const mailOptions = {
    from: `"Chlorif" <${from}>`,
    to: email,
    subject: "Reset your Password Code - Chlorif",
    text: `Chlorif Password Reset Request\n\nYou requested a password reset for your Chlorif store account. Use the following 6-digit verification code to verify your request and change your password:\n\n${code}\n\nThis code is valid for 15 minutes. If you did not make this request, you can safely ignore this email. Your password will remain unchanged.`,
    html: `
      <div style="font-family: 'Outfit', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="font-size: 28px; font-weight: 800; color: #6366f1; margin: 0; letter-spacing: -0.025em;">Chlorif</h2>
          <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 4px 0 0 0;">Nepali Boutique Sync</p>
        </div>
        
        <h3 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Password Reset Request</h3>
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
          You requested a password reset for your Chlorif store account. Use the following 6-digit verification code to verify your request and change your password:
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <div style="display: inline-block; padding: 16px 36px; background-color: #f8fafc; border: 2px dashed #e2e8f0; color: #0f172a; font-family: monospace; font-weight: 700; font-size: 32px; letter-spacing: 0.25em; border-radius: 12px;">
            ${code}
          </div>
        </div>
        
        <p style="font-size: 14px; line-height: 1.5; color: #334155; margin-bottom: 24px;">
          Please enter this code on the verification page to proceed with resetting your password.
        </p>
        
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;" />
        
        <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0;">
          This code is valid for 15 minutes. If you did not make this request, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}
