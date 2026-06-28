import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignRolesGuard } from './campaign-roles.guard';

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
const mockPrisma = {
  campaign: { findUnique: jest.fn() },
  projectMembership: { findUnique: jest.fn() },
  campaignMembership: { findUnique: jest.fn() },
};

describe('CampaignRolesGuard', () => {
  let guard: CampaignRolesGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CampaignRolesGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = module.get(CampaignRolesGuard);
    jest.clearAllMocks();
  });

  it('allows ADMIN without checking memberships', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    const ctx = makeContext(
      { id: 'admin-1', role: GlobalRole.ADMIN },
      { id: 'camp-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.campaign.findUnique).not.toHaveBeenCalled();
  });

  it('denies when no user', async () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ params: { id: 'camp-1' } }),
      }),
    } as unknown as ExecutionContext;
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('allows project member with matching role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    mockPrisma.campaign.findUnique.mockResolvedValue({
      project_id: 'proj-1',
      deleted_at: null,
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue({
      role: ProjectRole.MANAGER,
    });
    const ctx = makeContext(
      { id: 'user-1', role: GlobalRole.INTERNAL_USER },
      { id: 'camp-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.campaignMembership.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to campaign membership when no project membership', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    mockPrisma.campaign.findUnique.mockResolvedValue({
      project_id: 'proj-1',
      deleted_at: null,
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({
      role: ProjectRole.MANAGER,
    });
    const ctx = makeContext(
      { id: 'user-2', role: GlobalRole.AUTHORIZED_USER },
      { id: 'camp-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('denies campaign member with insufficient role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    mockPrisma.campaign.findUnique.mockResolvedValue({
      project_id: 'proj-1',
      deleted_at: null,
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({
      role: ProjectRole.VIEWER,
    });
    const ctx = makeContext(
      { id: 'user-2', role: GlobalRole.AUTHORIZED_USER },
      { id: 'camp-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('denies when user has neither project nor campaign membership', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockPrisma.campaign.findUnique.mockResolvedValue({
      project_id: 'proj-1',
      deleted_at: null,
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue(null);
    const ctx = makeContext(
      { id: 'user-3', role: GlobalRole.AUTHORIZED_USER },
      { id: 'camp-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('allows campaign member when no specific role required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockPrisma.campaign.findUnique.mockResolvedValue({
      project_id: 'proj-1',
      deleted_at: null,
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({
      role: ProjectRole.VIEWER,
    });
    const ctx = makeContext(
      { id: 'user-2', role: GlobalRole.AUTHORIZED_USER },
      { id: 'camp-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
