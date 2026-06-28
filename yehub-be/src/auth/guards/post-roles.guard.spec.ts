import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, ProjectRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PostRolesGuard } from './post-roles.guard';

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
  post: { findUnique: jest.fn() },
  projectMembership: { findUnique: jest.fn() },
  campaignMembership: { findUnique: jest.fn() },
};

describe('PostRolesGuard', () => {
  let guard: PostRolesGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PostRolesGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    guard = module.get(PostRolesGuard);
    jest.clearAllMocks();
  });

  it('allows ADMIN without checking memberships', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    const ctx = makeContext(
      { id: 'admin-1', role: GlobalRole.ADMIN },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
  });

  it('denies when no user', async () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ params: { id: 'post-1' } }),
      }),
    } as unknown as ExecutionContext;
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('denies when post is soft-deleted', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: new Date(),
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: null },
    });
    const ctx = makeContext(
      { id: 'user-1', role: GlobalRole.INTERNAL_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('denies when campaign is soft-deleted', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: null,
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: new Date() },
    });
    const ctx = makeContext(
      { id: 'user-1', role: GlobalRole.INTERNAL_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('allows project member with matching role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: null,
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: null },
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue({
      role: ProjectRole.MANAGER,
    });
    const ctx = makeContext(
      { id: 'user-1', role: GlobalRole.INTERNAL_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(mockPrisma.campaignMembership.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to campaign membership when no project membership', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: null,
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: null },
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({
      role: ProjectRole.MANAGER,
    });
    const ctx = makeContext(
      { id: 'user-2', role: GlobalRole.AUTHORIZED_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('denies member with insufficient role', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([ProjectRole.MANAGER]);
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: null,
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: null },
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({
      role: ProjectRole.VIEWER,
    });
    const ctx = makeContext(
      { id: 'user-2', role: GlobalRole.AUTHORIZED_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('denies when user has neither project nor campaign membership', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: null,
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: null },
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue(null);
    const ctx = makeContext(
      { id: 'user-3', role: GlobalRole.AUTHORIZED_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('allows member when no specific role required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    mockPrisma.post.findUnique.mockResolvedValue({
      deleted_at: null,
      campaign_id: 'camp-1',
      campaign: { project_id: 'proj-1', deleted_at: null },
    });
    mockPrisma.projectMembership.findUnique.mockResolvedValue(null);
    mockPrisma.campaignMembership.findUnique.mockResolvedValue({
      role: ProjectRole.VIEWER,
    });
    const ctx = makeContext(
      { id: 'user-2', role: GlobalRole.AUTHORIZED_USER },
      { id: 'post-1' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
