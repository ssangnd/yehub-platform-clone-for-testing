import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  describe('sendPasswordReset — SMTP not configured', () => {
    let service: MailService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                if (key === 'SMTP_HOST') return undefined;
                return def;
              }),
            },
          },
        ],
      }).compile();
      service = module.get<MailService>(MailService);
    });

    it('logs a warning with the reset link instead of sending email', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.sendPasswordReset(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=abc123',
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('alice@example.com'),
      );
    });
  });

  describe('sendPasswordReset — SMTP configured', () => {
    let service: MailService;
    let sendMailMock: jest.Mock;

    beforeEach(async () => {
      sendMailMock = jest.fn().mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, def?: unknown) => {
                if (key === 'SMTP_HOST') return 'smtp.example.com';
                if (key === 'SMTP_FROM') return 'noreply@yehub.com';
                return def;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<MailService>(MailService);
      // Override real transporter with mock to avoid live SMTP calls
      (service as unknown as { transporter: unknown })['transporter'] = {
        sendMail: sendMailMock,
      };
    });

    it('sends email with correct to, from, and subject', async () => {
      await service.sendPasswordReset(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=abc123',
      );

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          from: 'noreply@yehub.com',
          subject: 'Reset your YeHub password',
        }),
      );
    });

    it('includes the reset link in the email body', async () => {
      await service.sendPasswordReset(
        'alice@example.com',
        'Alice',
        'http://localhost:5173/reset-password?token=abc123',
      );

      const html = sendMailMock.mock.calls[0][0].html as string;
      expect(html).toContain(
        'http://localhost:5173/reset-password?token=abc123',
      );
    });
  });
});
