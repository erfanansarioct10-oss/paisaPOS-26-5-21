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
    html: `
      <div style="font-family: 'Outfit', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="font-size: 28px; font-weight: 800; color: #6366f1; margin: 0; letter-spacing: -0.025em;">Chlorif</h2>
          <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 4px 0 0 0;">Nepali Boutique Sync</p>
        </div>
        
        <h3 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome to Chlorif, ${fullName}!</h3>
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
          Thank you for registering your store. To complete your setup and enter the system, please verify your email address by clicking the button below:
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationLink}" style="display: inline-block; padding: 14px 32px; background-color: #6366f1; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2), 0 2px 4px -1px rgba(99, 102, 241, 0.1); transition: all 0.2s;">
            Verify Email Address
          </a>
        </div>
        
        <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px;">
          If the button above does not work, copy and paste the following URL into your web browser:
          <br />
          <a href="${verificationLink}" style="color: #6366f1; word-break: break-all;">${verificationLink}</a>
        </p>
        
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;" />
        
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
