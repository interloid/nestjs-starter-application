import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Env } from '../config/env.validation';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter!: Transporter;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      auth: {
        user: this.config.get('SMTP_USER', { infer: true }),
        pass: this.config.get('SMTP_PASSWORD', { infer: true }),
      },
    });
  }

  async send(opts: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    this.logger.info('Email sent', { to: opts.to, subject: opts.subject });
  }
}
