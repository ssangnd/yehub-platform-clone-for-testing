import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from './list-users-query.dto';

async function parse(raw: Record<string, unknown>) {
  const dto = plainToInstance(ListUsersQueryDto, raw, {
    enableImplicitConversion: false,
  });
  const errors = await validate(dto);
  return { dto, errors };
}

describe('ListUsersQueryDto', () => {
  describe('q', () => {
    it('accepts a trimmed non-empty string', async () => {
      const { dto, errors } = await parse({ q: '  alice  ' });
      expect(errors).toHaveLength(0);
      expect(dto.q).toBe('alice');
    });

    it('rejects strings longer than 100 chars', async () => {
      const { errors } = await parse({ q: 'a'.repeat(101) });
      expect(errors.map((e) => e.property)).toContain('q');
    });

    it('is optional', async () => {
      const { dto, errors } = await parse({});
      expect(errors).toHaveLength(0);
      expect(dto.q).toBeUndefined();
    });
  });

  describe('role', () => {
    it('wraps a single value into an array', async () => {
      const { dto, errors } = await parse({ role: 'ADMIN' });
      expect(errors).toHaveLength(0);
      expect(dto.role).toEqual(['ADMIN']);
    });

    it('accepts multiple values as an array', async () => {
      const { dto, errors } = await parse({
        role: ['ADMIN', 'INTERNAL_USER'],
      });
      expect(errors).toHaveLength(0);
      expect(dto.role).toEqual(['ADMIN', 'INTERNAL_USER']);
    });

    it('rejects unknown enum values', async () => {
      const { errors } = await parse({ role: 'SUPERVISOR' });
      expect(errors.map((e) => e.property)).toContain('role');
    });
  });

  describe('status', () => {
    it('wraps a single value into an array', async () => {
      const { dto, errors } = await parse({ status: 'ACTIVE' });
      expect(errors).toHaveLength(0);
      expect(dto.status).toEqual(['ACTIVE']);
    });

    it('rejects unknown enum values', async () => {
      const { errors } = await parse({ status: 'PENDING' });
      expect(errors.map((e) => e.property)).toContain('status');
    });
  });
});
