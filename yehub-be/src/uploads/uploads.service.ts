import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const UPLOAD_EXPIRY = 900; // 15 minutes
const DOWNLOAD_EXPIRY = 86400; // 24 hours

@Injectable()
export class UploadsService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string | undefined;
  private readonly publicEndpoint: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET')!;
    this.endpoint = this.config.get<string>('S3_ENDPOINT');
    this.publicEndpoint = this.config.get<string>('S3_PUBLIC_ENDPOINT');
    this.s3 = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY')!,
      },
      ...(this.endpoint && {
        endpoint: this.endpoint,
        forcePathStyle:
          this.config.get<string>('S3_FORCE_PATH_STYLE', 'false') === 'true',
      }),
    });
  }

  async generateUploadUrl(
    contentType: string,
    fileName: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    const normalized = this.normalizeFileName(fileName);
    const ext = extname(normalized).slice(1) || 'bin';
    const baseName = normalized.replace(/\.[^.]+$/, '');
    const key = `uploads/images/${randomUUID()}-${baseName}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: UPLOAD_EXPIRY,
    });

    return { uploadUrl: this.toPublicUrl(uploadUrl), key };
  }

  async generateDownloadUrl(key: string): Promise<{ downloadUrl: string }> {
    if (!key.startsWith('uploads/') || key.includes('..')) {
      throw new BadRequestException('Invalid file key');
    }

    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      if (name === 'NotFound' || name === 'NoSuchKey') {
        throw new NotFoundException('File not found');
      }
      throw err;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: DOWNLOAD_EXPIRY,
    });

    return { downloadUrl: this.toPublicUrl(downloadUrl) };
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    const base = (this.publicEndpoint ?? this.endpoint ?? '').replace(
      /\/$/,
      '',
    );
    return `${base}/${this.bucket}/${key}`;
  }

  async mirrorRemoteImage(url: string, key: string): Promise<string | null> {
    const ownBase = this.publicEndpoint ?? this.endpoint;
    if (ownBase && url.startsWith(ownBase)) return url;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      return await this.putObject(key, buffer, contentType);
    } catch {
      return null;
    }
  }

  private toPublicUrl(url: string): string {
    if (this.publicEndpoint && this.endpoint) {
      return url.replace(this.endpoint, this.publicEndpoint);
    }
    return url;
  }

  private normalizeFileName(fileName: string): string {
    const ext = extname(fileName).toLowerCase();
    const base = fileName
      .slice(0, fileName.length - ext.length)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return base + ext;
  }
}
