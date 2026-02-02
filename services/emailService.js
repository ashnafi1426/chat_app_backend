import nodemailer from 'nodemailer';
import { config } from '../config/config.js';

export class EmailService {
  static transporter = null;

  static initialize() {
    if (!config.email.user || !config.email.password) {
      console.warn('[EMAIL] Email service not configured. Email features will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: config.email.service,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });

    console.log('[EMAIL] Email service initialized');
  }

  static async sendVerificationEmail(email, username, verificationToken) {
    if (!this.transporter) {
      console.warn('[EMAIL] Email service not configured. Skipping verification email.');
      return false;
    }

    const verificationUrl = `${config.app.clientUrl}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: `"ChatSphere" <${config.email.from}>`,
      to: email,
      subject: 'Verify Your Email - ChatSphere',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ChatSphere!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${username}</strong>,</p>
              <p>Thank you for registering with ChatSphere. To complete your registration and start chatting, please verify your email address.</p>
              <p style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
              <p>If you didn't create an account with ChatSphere, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 ChatSphere. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL] Verification email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send verification email:', error);
      return false;
    }
  }

  static async sendPasswordResetEmail(email, username, resetToken) {
    if (!this.transporter) {
      console.warn('[EMAIL] Email service not configured. Skipping password reset email.');
      return false;
    }

    const resetUrl = `${config.app.clientUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"ChatSphere" <${config.email.from}>`,
      to: email,
      subject: 'Reset Your Password - ChatSphere',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${username}</strong>,</p>
              <p>We received a request to reset your password for your ChatSphere account.</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 ChatSphere. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL] Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send password reset email:', error);
      return false;
    }
  }
}
