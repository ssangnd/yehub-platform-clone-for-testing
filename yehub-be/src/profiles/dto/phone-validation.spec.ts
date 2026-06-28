import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProfileDto } from './create-profile.dto';
import { UpdateProfileDto } from './update-profile.dto';
import { PHONE_REGEX } from './phone-validation';

const baseCreate = {
  name: 'John Doe',
  gender: 'MALE',
  tierId: '00000000-0000-4000-8000-000000000001',
  categoryIds: ['00000000-0000-4000-8000-000000000002'],
  socialAccounts: [{ platform: 'FACEBOOK', url: 'https://facebook.com/jd' }],
};

const baseUpdate = {
  name: 'John Doe',
  gender: 'MALE',
  tierId: '00000000-0000-4000-8000-000000000001',
  categoryIds: ['00000000-0000-4000-8000-000000000002'],
};

async function phoneErrors(dto: CreateProfileDto | UpdateProfileDto) {
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'phone');
}

describe('phone-validation regex', () => {
  it.each([
    '',
    '0901000001',
    '02838155555',
    '+84123456789',
    '+1 (555) 123-4567',
    '+44 20 7946 0958',
    '0901-000-001',
    '+84.912.345.678',
    '+999999999999999', // 15 digits, E.164 max
  ])('accepts %j', (value) => {
    expect(PHONE_REGEX.test(value)).toBe(true);
  });

  it.each([
    'abc',
    '123', // too short
    '+', // no digits
    '+abc123', // mixed letters
    '++84123456789', // double plus
    '+9999999999999999', // 16 digits, too long
    'phone: 0901000001', // disallowed chars
    '0901000001 ext 4', // disallowed chars
  ])('rejects %j', (value) => {
    expect(PHONE_REGEX.test(value)).toBe(false);
  });
});

describe('CreateProfileDto.phone', () => {
  it('accepts a valid international phone', async () => {
    const dto = plainToInstance(CreateProfileDto, {
      ...baseCreate,
      phone: '+84 912 345 678',
    });
    expect(await phoneErrors(dto)).toHaveLength(0);
  });

  it('accepts a missing phone (optional field)', async () => {
    const dto = plainToInstance(CreateProfileDto, baseCreate);
    expect(await phoneErrors(dto)).toHaveLength(0);
  });

  it('rejects garbage strings with the user-facing message', async () => {
    const dto = plainToInstance(CreateProfileDto, {
      ...baseCreate,
      phone: 'not-a-phone',
    });
    const errs = await phoneErrors(dto);
    expect(errs).toHaveLength(1);
    expect(Object.values(errs[0].constraints ?? {})[0]).toMatch(
      /Invalid phone number/,
    );
  });

  it('rejects a too-short phone', async () => {
    const dto = plainToInstance(CreateProfileDto, {
      ...baseCreate,
      phone: '12345',
    });
    expect(await phoneErrors(dto)).toHaveLength(1);
  });
});

describe('UpdateProfileDto.phone', () => {
  it('accepts null (clear phone)', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      ...baseUpdate,
      phone: null,
    });
    expect(await phoneErrors(dto)).toHaveLength(0);
  });

  it('rejects a phone with invalid characters', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      ...baseUpdate,
      phone: '0901-abc-001',
    });
    expect(await phoneErrors(dto)).toHaveLength(1);
  });
});
