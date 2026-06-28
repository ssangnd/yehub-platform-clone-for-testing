import { SystemSettingType } from '../../generated/prisma/client';

export const SYSTEM_SETTING_KEYS = {
  LOGO: 'logo',
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

export const PUBLIC_SETTING_KEYS: readonly SystemSettingKey[] = [
  SYSTEM_SETTING_KEYS.LOGO,
];

export const KNOWN_SETTING_TYPES: Record<SystemSettingKey, SystemSettingType> =
  {
    [SYSTEM_SETTING_KEYS.LOGO]: SystemSettingType.TEXT,
  };
