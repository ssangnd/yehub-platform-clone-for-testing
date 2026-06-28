import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  Prisma,
  SystemSetting,
  SystemSettingType,
} from '../../generated/prisma/client';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import {
  KNOWN_SETTING_TYPES,
  PUBLIC_SETTING_KEYS,
  SYSTEM_SETTING_KEYS,
  SystemSettingKey,
} from './system-settings.constants';

export interface SystemSettingValue {
  key: string;
  type: SystemSettingType;
  value: string | boolean | number | null;
  updated_at: Date;
}

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async listAll(): Promise<SystemSettingValue[]> {
    const rows = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => this.toValue(row));
  }

  async getPublicSettings(): Promise<{
    logo: { key: string; url: string } | null;
  }> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...PUBLIC_SETTING_KEYS] } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));

    const logoRow = byKey.get(SYSTEM_SETTING_KEYS.LOGO);
    const logoKey = logoRow?.value_text?.trim() || null;

    let logo: { key: string; url: string } | null = null;
    if (logoKey) {
      try {
        const { downloadUrl } = await this.uploads.generateDownloadUrl(logoKey);
        logo = { key: logoKey, url: downloadUrl };
      } catch {
        logo = null;
      }
    }

    return { logo };
  }

  async upsert(
    key: string,
    dto: UpsertSettingDto,
  ): Promise<SystemSettingValue> {
    this.assertKnownType(key, dto.type);
    this.assertPayloadMatchesType(dto);

    const data: Prisma.SystemSettingUncheckedCreateInput = {
      key,
      type: dto.type,
      value_text:
        dto.type === SystemSettingType.TEXT ? (dto.value_text ?? null) : null,
      value_boolean:
        dto.type === SystemSettingType.BOOLEAN
          ? (dto.value_boolean ?? null)
          : null,
      value_number:
        dto.type === SystemSettingType.NUMBER
          ? (dto.value_number ?? null)
          : null,
    };

    const row = await this.prisma.systemSetting.upsert({
      where: { key },
      create: data,
      update: {
        type: data.type,
        value_text: data.value_text,
        value_boolean: data.value_boolean,
        value_number: data.value_number,
      },
    });

    return this.toValue(row);
  }

  private toValue(row: SystemSetting): SystemSettingValue {
    let value: string | boolean | number | null = null;
    switch (row.type) {
      case SystemSettingType.TEXT:
        value = row.value_text;
        break;
      case SystemSettingType.BOOLEAN:
        value = row.value_boolean;
        break;
      case SystemSettingType.NUMBER:
        value = row.value_number;
        break;
    }
    return {
      key: row.key,
      type: row.type,
      value,
      updated_at: row.updated_at,
    };
  }

  private assertKnownType(key: string, type: SystemSettingType) {
    const expected = KNOWN_SETTING_TYPES[key as SystemSettingKey];
    if (expected && expected !== type) {
      throw new BadRequestException(
        `Setting "${key}" must be of type ${expected}`,
      );
    }
  }

  private assertPayloadMatchesType(dto: UpsertSettingDto) {
    if (dto.type === SystemSettingType.TEXT && dto.value_text === undefined) {
      throw new BadRequestException('value_text is required for TEXT settings');
    }
    if (
      dto.type === SystemSettingType.BOOLEAN &&
      dto.value_boolean === undefined
    ) {
      throw new BadRequestException(
        'value_boolean is required for BOOLEAN settings',
      );
    }
    if (
      dto.type === SystemSettingType.NUMBER &&
      dto.value_number === undefined
    ) {
      throw new BadRequestException(
        'value_number is required for NUMBER settings',
      );
    }
  }
}
