import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

const mockAppService = {
  checkReadiness: jest.fn(),
};

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    controller = app.get<AppController>(AppController);
  });

  describe('getLiveness', () => {
    it('should return ok status', () => {
      expect(controller.getLiveness()).toEqual({ status: 'ok' });
    });
  });

  describe('getReadiness', () => {
    it('should return health checks when all ok', async () => {
      const health = { status: 'ok', checks: { database: 'ok', redis: 'ok' } };
      mockAppService.checkReadiness.mockResolvedValue(health);

      const result = await controller.getReadiness();
      expect(result).toEqual(health);
    });

    it('should throw ServiceUnavailableException when a check fails', async () => {
      const health = {
        status: 'error',
        checks: { database: 'error', redis: 'ok' },
      };
      mockAppService.checkReadiness.mockResolvedValue(health);

      await expect(controller.getReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
