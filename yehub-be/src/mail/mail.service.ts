import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      const user = this.config.get<string>('SMTP_USER');
      const pass = this.config.get<string>('SMTP_PASS');
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        ...(user && pass ? { auth: { user, pass } } : {}),
      });
    }
  }

  async sendInvitation(email: string, name: string, invitationLink: string) {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@yehub.com');

    if (!this.transporter) {
      this.logger.warn(
        `[DEV] SMTP not configured. Invitation link for ${email}: ${invitationLink}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'You have been invited to YeHub',
      html: `
        <h2>Welcome to YeHub, ${name}!</h2>
        <p>You have been invited to join the YeHub platform.</p>
        <p>Click the link below to set your password and activate your account:</p>
        <p><a href="${invitationLink}">${invitationLink}</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    });
  }

  async sendPasswordReset(email: string, name: string, resetLink: string) {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@yehub.com');

    if (!this.transporter) {
      this.logger.warn(
        `[DEV] SMTP not configured. Password reset link for ${email}: ${resetLink}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Reset your YeHub password',
      html: `
        <h2>Hi ${name},</h2>
        <p>You requested a password reset for your YeHub account.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 15 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
    });
  }
}
