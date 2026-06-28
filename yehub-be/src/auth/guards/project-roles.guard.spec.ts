import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectRolesGuard } from './project-roles.guard';

const makeContext = (
  user: { id: string; role: GlobalRole },
  params: Record<string, string> = {},
) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  }) as unknown as ExecutionContext;

const mockReflector = { getAllAndOverride: jest.fn() };
const mockPrisma = { projectMembership: { findUnique: jest.fn() } };

describe('ProjectRolesGuard', () => {
  let guard: ProjectRolesGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProjectRolesGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = module.get(ProjectRolesGuard);
    jest.clearAllMocks();
  });

  describe('admin bypass', () => {
    it('returns true for ADMIN without hitting the database', async () => {
      mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
      const ctx = makeContext(
        { id: 'admin-1', role: GlobalRole.ADMIN },
        { id: 'proj-1' },
      );

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPrisma.projectMembership.findUnique).not.toHaveBeenCalled();
    });

    it('returns true for ADMIN even when no roles are required', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const ctx = makeContext(
        { id: 'admin-1', role: GlobalRole.ADMIN },
        { id: 'proj-1' },
      );

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockPrisma.projectMembership.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('non-admin membership check', () => {
    it('returns false when non-admin has no membership', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
      const ctx = makeContext(
        { id: 'user-1', role: GlobalRole.INTERNAL_USER },
        { id: 'proj-1' },
      );

      const result = await guard.canActivate(ctx);

      expect(result).toBe(false);
    });

    it('returns true when non-admin is a member and no role is required', async () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      mockPrisma.projectMembership.findUnique.mockResolvedValue({
        user_id: 'user-1',
        project_id: 'proj-1',
        role: ProjectRole.VIEWER,
      });
      const ctx = makeContext(
        { id: 'user-1', role: GlobalRole.INTERNAL_USER },
        { id: 'proj-1' },
      );

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('returns false when non-admin is a member but lacks required role', async () => {
      mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
      mockPrisma.projectMembership.findUnique.mockResolvedValue({
        user_id: 'user-1',
        project_id: 'proj-1',
        role: ProjectRole.VIEWER,
      });
      const ctx = makeContext(
        { id: 'user-1', role: GlobalRole.INTERNAL_USER },
        { id: 'proj-1' },
      );

      const result = await guard.canActivate(ctx);

      expect(result).toBe(false);
    });
  });
});
