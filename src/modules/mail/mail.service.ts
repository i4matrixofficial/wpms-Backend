import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.from = this.config.get<string>('SMTP_FROM')!;
    const user = this.config.get<string>('SMTP_USER');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT'),
      secure: false, // Mailpit is plain; real providers often use 587+STARTTLS
      auth: user
        ? { user, pass: this.config.get<string>('SMTP_PASS') }
        : undefined,
    });
  }

  async sendOtp(to: string, code: string) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Your WPMS password reset code',
      text: `Your password reset code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your password reset code is <b style="font-size:20px">${code}</b>.</p><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
    });
    this.logger.log(`OTP email sent to ${to}`);
  }
}
