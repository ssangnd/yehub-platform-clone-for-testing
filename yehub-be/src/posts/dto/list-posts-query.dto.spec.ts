import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPostsQueryDto } from './list-posts-query.dto';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

async function parse(raw: Record<string, unknown>) {
  const dto = plainToInstance(ListPostsQueryDto, raw, {
    enableImplicitConversion: false,
  });
  const errors = await validate(dto);
  return { dto, errors };
}

describe('ListPostsQueryDto', () => {
  describe('social_account_id', () => {
    it('coerces a single value into a one-element array', async () => {
      const { dto, errors } = await parse({ social_account_id: UUID_A });
      expect(
        errors.find((e) => e.property === 'social_account_id'),
      ).toBeUndefined();
      expect(dto.social_account_id).toEqual([UUID_A]);
    });

    it('preserves an array of valid UUIDs', async () => {
      const { dto, errors } = await parse({
        social_account_id: [UUID_A, UUID_B],
      });
      expect(
        errors.find((e) => e.property === 'social_account_id'),
      ).toBeUndefined();
      expect(dto.social_account_id).toEqual([UUID_A, UUID_B]);
    });

    it('rejects an invalid UUID', async () => {
      const { errors } = await parse({ social_account_id: 'not-a-uuid' });
      expect(
        errors.find((e) => e.property === 'social_account_id'),
      ).toBeDefined();
    });

    it('is optional and left undefined when omitted', async () => {
      const { dto, errors } = await parse({});
      expect(
        errors.find((e) => e.property === 'social_account_id'),
      ).toBeUndefined();
      expect(dto.social_account_id).toBeUndefined();
    });
  });
});
