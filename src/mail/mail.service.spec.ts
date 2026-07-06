const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { LoggerService } from '../logger/logger.service';
import type { Env } from '../config/env.validation';

const SMTP: Record<string, string | number | boolean> = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'smtp-pass',
  MAIL_FROM: 'no-reply@example.com',
};
describe('MailService', () => {
  let service: MailService;
  let config: jest.Mocked<Pick<ConfigService<Env, true>, 'get'>>;
  let logger: jest.Mocked<Pick<LoggerService, 'info'>>;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string) => SMTP[key]) as unknown as jest.Mocked<
        ConfigService<Env, true>
      >['get'],
    };
    logger = { info: jest.fn() };

    service = new MailService(
      config as unknown as ConfigService<Env, true>,
      logger as unknown as LoggerService,
    );

    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('creates the transporter from SMTP config', () => {
      service.onModuleInit();

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          auth: { user: 'smtp-user', pass: 'smtp-pass' },
        }),
      );
    });
  });

  describe('send', () => {
    beforeEach(() => {
      service.onModuleInit(); // build the transporter first
    });

    it('sends with from=MAIL_FROM and the provided fields', async () => {
      await service.send({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      });

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'no-reply@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: undefined,
      });
    });

    it('forwards the optional text field when provided', async () => {
      await service.send({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hi' }));
    });

    it('logs after a successful send', async () => {
      await service.send({ to: 'user@example.com', subject: 'Hello', html: 'x' });

      expect(logger.info).toHaveBeenCalledWith('Email sent', {
        to: 'user@example.com',
        subject: 'Hello',
      });
    });

    it('propagates a transporter failure (so BullMQ can retry)', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));

      await expect(
        service.send({ to: 'user@example.com', subject: 'Hello', html: 'x' }),
      ).rejects.toThrow('SMTP down');

      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
