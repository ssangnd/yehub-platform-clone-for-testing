import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { SystemSettingType } from '../../generated/prisma/client';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let prisma: { systemSetting: { findMany: jest.Mock; upsert: jest.Mock } };
  let uploads: { generateDownloadUrl: jest.Mock };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    uploads = {
      generateDownloadUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();

    service = module.get(SystemSettingsService);
  });

  describe('getPublicSettings', () => {
    it('returns null logo when no logo setting exists', async () => {
      prisma.systemSetting.findMany.mockResolvedValueOnce([]);

      const result = await service.getPublicSettings();
      expect(result).toEqual({ logo: null });
      expect(uploads.generateDownloadUrl).not.toHaveBeenCalled();
    });

    it('returns presigned URL when logo setting has a key', async () => {
      prisma.systemSetting.findMany.mockResolvedValueOnce([
        {
          key: 'logo',
          type: SystemSettingType.TEXT,
          value_text: 'uploads/images/abc.png',
          value_boolean: null,
          value_number: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      uploads.generateDownloadUrl.mockResolvedValueOnce({
        downloadUrl: 'https://s3.example/abc.png?sig=1',
      });

      const result = await service.getPublicSettings();
      expect(result.logo).toEqual({
        key: 'uploads/images/abc.png',
        url: 'https://s3.example/abc.png?sig=1',
      });
    });

    it('returns null logo when the stored key no longer exists in S3', async () => {
      prisma.systemSetting.findMany.mockResolvedValueOnce([
        {
          key: 'logo',
          type: SystemSettingType.TEXT,
          value_text: 'uploads/images/missing.png',
          value_boolean: null,
          value_number: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      uploads.generateDownloadUrl.mockRejectedValueOnce(new Error('NotFound'));

      const result = await service.getPublicSettings();
      expect(result.logo).toBeNull();
    });
  });

  describe('upsert', () => {
    it('rejects logo setting with non-TEXT type', async () => {
      await expect(
        service.upsert('logo', {
          type: SystemSettingType.BOOLEAN,
          value_boolean: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('writes only the typed column matching the provided type', async () => {
      prisma.systemSetting.upsert.mockResolvedValueOnce({
        key: 'notifications_enabled',
        type: SystemSettingType.BOOLEAN,
        value_text: null,
        value_boolean: true,
        value_number: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await service.upsert('notifications_enabled', {
        type: SystemSettingType.BOOLEAN,
        value_boolean: true,
      });

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'notifications_enabled' },
          create: expect.objectContaining({
            type: SystemSettingType.BOOLEAN,
            value_text: null,
            value_boolean: true,
            value_number: null,
          }),
        }),
      );
    });

    it('requires value field matching declared type', async () => {
      await expect(
        service.upsert('some_number', { type: SystemSettingType.NUMBER }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts null for TEXT value to clear the setting', async () => {
      prisma.systemSetting.upsert.mockResolvedValueOnce({
        key: 'logo',
        type: SystemSettingType.TEXT,
        value_text: null,
        value_boolean: null,
        value_number: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.upsert('logo', {
        type: SystemSettingType.TEXT,
        value_text: null,
      });

      expect(result.value).toBeNull();
    });
  });
});
