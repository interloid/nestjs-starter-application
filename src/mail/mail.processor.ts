import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LoggerService } from '../logger/logger.service';
import { MailService } from './mail.service';
import { MAIL_QUEUE } from './mail.constants';

interface MailJobData {
  email: string;
  link: string;
}

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    private readonly mailer: MailService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    const { email, link } = job.data;

    switch (job.name) {
      case 'email-verification':
        await this.mailer.send({
          to: email,
          subject: 'Verify your email',
          html: this.verificationTemplate(link),
        });
        break;

      case 'password-reset':
        await this.mailer.send({
          to: email,
          subject: 'Reset your password',
          html: this.resetTemplate(link),
        });
        break;

      default:
        throw new Error(`Unknown mail job: ${job.name}`);
    }
  }

  private verificationTemplate(link: string): string {
    return `
      <h2>Verify your email</h2>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${link}">Verify Email</a></p>
      <p>This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    `;
  }

  private resetTemplate(link: string): string {
    return `
      <h2>Reset your password</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    `;
  }

  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error('Mail worker error', { error: err.message });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error('Mail job failed', { jobId: job.id, name: job.name, error: err.message });
  }
}
