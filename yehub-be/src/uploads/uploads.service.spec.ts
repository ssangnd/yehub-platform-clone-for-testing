import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

const mockSend = jest.fn();
(S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));
(getSignedUrl as jest.Mock).mockResolvedValue(
  'http://minio:9000/yehub/uploads/images/test?X-Amz-Signature=abc',
);

const mockConfig: Record<string, string | undefined> = {
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'yehub',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => mockConfig[key] },
        },
      ],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  describe('generateUploadUrl', () => {
    it('returns a presigned upload URL and S3 key', async () => {
      const result = await service.generateUploadUrl(
        'image/png',
        'My Avatar.PNG',
      );

      expect(result.uploadUrl).toBe(
        'http://localhost:9000/yehub/uploads/images/test?X-Amz-Signature=abc',
      );
      expect(result.key).toMatch(
        /^uploads\/images\/[0-9a-f-]{36}-my-avatar\.png$/,
      );
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 900 }),
      );
    });

    it('normalizes filename with special characters', async () => {
      const result = await service.generateUploadUrl(
        'image/jpeg',
        'Photo (1) @home!.JPEG',
      );

      expect(result.key).toMatch(
        /^uploads\/images\/[0-9a-f-]{36}-photo-1-home\.jpeg$/,
      );
    });
  });

  describe('generateDownloadUrl', () => {
    it('returns a presigned download URL for an existing object', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await service.generateDownloadUrl(
        'uploads/images/abc-avatar.png',
      );

      expect(result.downloadUrl).toBe(
        'http://localhost:9000/yehub/uploads/images/test?X-Amz-Signature=abc',
      );
      expect(mockSend).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 86400 }),
      );
    });

    it('throws NotFoundException when object does not exist', async () => {
      const notFound = new Error('Not Found');
      notFound.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFound);

      await expect(
        service.generateDownloadUrl('uploads/images/missing.png'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects keys that do not start with uploads/', async () => {
      await expect(
        service.generateDownloadUrl('secrets/passwords.txt'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
