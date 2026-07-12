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
    const port = this.config.get<number>('SMTP_PORT')!;

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port,
      secure: port === 465, // 465 → true (SSL); 587/1025 → false
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
