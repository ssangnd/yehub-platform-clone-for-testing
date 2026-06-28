import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectRole } from '../../generated/prisma/client';

const now = new Date();

const makeProject = (
  overrides: Partial<{
    id: string;
    name: string;
    client_name: string | null;
    active: boolean;
  }> = {},
) => ({
  id: overrides.id ?? 'proj-1',
  name: overrides.name ?? 'Alpha',
  description: null,
  client_name: overrides.client_name ?? null,
  logo: null,
  active: overrides.active ?? true,
  created_at: now,
  updated_at: now,
  _count: { memberships: 2 },
  categories: [{ category: { id: 'cat-1', name: 'Tech' } }],
  campaigns: [
    {
      status: 'ACTIVE',
      _count: { posts: 5 },
      posts: [
        { comment_count: 4 },
        { comment_count: 6 },
        { comment_count: 0 },
        { comment_count: 0 },
        { comment_count: 0 },
      ],
    },
    {
      status: 'DRAFT',
      _count: { posts: 3 },
      posts: [{ comment_count: 1 }, { comment_count: 2 }, { comment_count: 0 }],
    },
    {
      status: 'ACTIVE',
      _count: { posts: 2 },
      posts: [{ comment_count: 7 }, { comment_count: 5 }],
    },
  ],
});

const mockPrisma = {
  project: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  projectMembership: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    const userId = 'user-1';

    it('returns paginated projects with defaults (page=1, limit=20)', async () => {
      const project = makeProject();
      mockPrisma.$transaction.mockResolvedValue([[project], 1]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      const result = await service.findAll(userId, {});

      expect(result).toEqual({
        data: [
          {
            id: 'proj-1',
            name: 'Alpha',
            description: null,
            client_name: null,
            logo: null,
            categories: [{ id: 'cat-1', name: 'Tech' }],
            active: true,
            created_at: now,
            updated_at: now,
            member_count: 2,
            campaign_count: 3,
            active_campaign_count: 2,
            planned_campaign_count: 1,
            post_count: 10,
            comment_count: 25,
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.anything(), // findMany promise
        expect.anything(), // count promise
      ]);
    });

    it('applies skip/take for page=2, limit=5', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 10]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { page: 2, limit: 5 });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('filters by active=true', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { active: true });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
      expect(mockPrisma.project.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('omits active filter when active is undefined', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {});

      const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('active');
    });

    it('adds OR name/client_name search when q is provided', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { q: 'acme' });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'acme', mode: 'insensitive' } },
              { client_name: { contains: 'acme', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('omits OR filter when q is not provided', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {});

      const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('OR');
    });

    it('computes totalPages correctly', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 21]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      const result = await service.findAll(userId, { limit: 10 });

      expect(result.total).toBe(21);
      expect(result.totalPages).toBe(3);
    });

    it('returns totalPages=0 when total=0', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      const result = await service.findAll(userId, {});

      expect(result.totalPages).toBe(0);
    });

    it('always scopes results to the calling user memberships', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {});

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberships: { some: { user_id: userId } },
          }),
        }),
      );
    });

    it('filters by active=false', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { active: false });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: false }),
        }),
      );
      expect(mockPrisma.project.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('passes q search filter to count', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, { q: 'acme' });

      expect(mockPrisma.project.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'acme', mode: 'insensitive' } },
              { client_name: { contains: 'acme', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('omits memberships filter when isAdmin=true', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {}, true);

      const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('memberships');
    });

    it('includes memberships filter when isAdmin=false (default)', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      mockPrisma.project.findMany.mockReturnValue('findManyCall');
      mockPrisma.project.count.mockReturnValue('countCall');

      await service.findAll(userId, {});

      const whereArg = mockPrisma.project.findMany.mock.calls[0][0].where;
      expect(whereArg).toHaveProperty('memberships', {
        some: { user_id: userId },
      });
    });
  });

  describe('getNonMembers', () => {
    const projectId = 'proj-1';

    beforeEach(() => {
      mockPrisma.project.findUnique.mockResolvedValue(makeProject());
    });

    it('returns all non-members with no query params', async () => {
      const users = [
        { id: 'u1', email: 'a@a.com', name: 'Alice', role: 'AUTHORIZED_USER' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.getNonMembers(projectId, {});

      expect(result).toEqual([
        {
          id: 'u1',
          email: 'a@a.com',
          name: 'Alice',
          global_role: 'AUTHORIZED_USER',
        },
      ]);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            memberships: { none: { project_id: projectId } },
          }),
        }),
      );
    });

    it('applies name/email search when q is provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getNonMembers(projectId, { q: 'alice' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'alice', mode: 'insensitive' } },
              { email: { contains: 'alice', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('omits OR filter when q is not provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getNonMembers(projectId, {});

      const whereArg = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg).not.toHaveProperty('OR');
    });

    it('applies take when limit is provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getNonMembers(projectId, { limit: 5 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('uses default limit of 20 when limit is not provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getNonMembers(projectId, {});

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });
  });

  describe('archive', () => {
    const projectId = 'proj-1';

    beforeEach(() => {
      mockPrisma.project.findUnique.mockReset();
      mockPrisma.project.update.mockReset();
    });

    it('throws BadRequest when any campaign is not COMPLETED', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        ...makeProject(),
        campaigns: [{ status: 'COMPLETED' }, { status: 'ACTIVE' }],
      });

      await expect(service.archive(projectId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it('archives the project when all campaigns are COMPLETED', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        ...makeProject(),
        campaigns: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
      });
      mockPrisma.project.update.mockResolvedValue(
        makeProject({ active: false }),
      );

      await service.archive(projectId);

      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: { active: false },
        }),
      );
    });

    it('archives the project when it has no campaigns', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        ...makeProject(),
        campaigns: [],
      });
      mockPrisma.project.update.mockResolvedValue(
        makeProject({ active: false }),
      );

      await service.archive(projectId);

      expect(mockPrisma.project.update).toHaveBeenCalled();
    });

    it('is a no-op when the project is already archived', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        ...makeProject({ active: false }),
        campaigns: [],
      });

      await service.archive(projectId);

      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when the project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.archive(projectId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('unarchive', () => {
    const projectId = 'proj-1';

    beforeEach(() => {
      mockPrisma.project.findUnique.mockReset();
      mockPrisma.project.update.mockReset();
    });

    it('throws NotFound when the project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.unarchive(projectId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('activates an archived project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(
        makeProject({ active: false }),
      );
      mockPrisma.project.update.mockResolvedValue(
        makeProject({ active: true }),
      );

      await service.unarchive(projectId);

      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: projectId },
          data: { active: true },
        }),
      );
    });

    it('is a no-op when the project is already active', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(
        makeProject({ active: true }),
      );

      await service.unarchive(projectId);

      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });
  });

  describe('update on archived projects', () => {
    const projectId = 'proj-1';

    beforeEach(() => {
      mockPrisma.project.findUnique.mockReset();
      mockPrisma.project.update.mockReset();
    });

    it('throws BadRequest when editing an archived project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        name: 'Alpha',
        active: false,
      });

      await expect(
        service.update(projectId, { name: 'New name' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });
  });

  describe('membership changes on archived projects', () => {
    const projectId = 'proj-1';

    it('addMember throws BadRequest when project is archived', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(
        makeProject({ active: false }),
      );

      await expect(
        service.addMember(projectId, {
          user_id: 'user-2',
          role: ProjectRole.EXECUTIVE,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.projectMembership.create).not.toHaveBeenCalled();
    });

    it('updateMember throws BadRequest when project is archived', async () => {
      mockPrisma.projectMembership.findUnique.mockResolvedValue({
        user_id: 'user-2',
        project_id: projectId,
        role: ProjectRole.EXECUTIVE,
        project: { active: false },
      });

      await expect(
        service.updateMember(
          projectId,
          'user-2',
          ProjectRole.MANAGER,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.projectMembership.update).not.toHaveBeenCalled();
    });

    it('removeMember throws BadRequest when project is archived', async () => {
      mockPrisma.projectMembership.findUnique.mockResolvedValue({
        user_id: 'user-2',
        project_id: projectId,
        role: ProjectRole.EXECUTIVE,
        project: { active: false },
      });

      await expect(
        service.removeMember(projectId, 'user-2', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.projectMembership.delete).not.toHaveBeenCalled();
    });

    it('updateMember throws BadRequest when acting on own membership', async () => {
      await expect(
        service.updateMember(
          projectId,
          'user-1',
          ProjectRole.MANAGER,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.projectMembership.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.projectMembership.update).not.toHaveBeenCalled();
    });

    it('removeMember throws BadRequest when acting on own membership', async () => {
      await expect(
        service.removeMember(projectId, 'user-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.projectMembership.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.projectMembership.delete).not.toHaveBeenCalled();
    });
  });

  describe('create — duplicate name', () => {
    const userId = 'user-1';

    beforeEach(() => {
      mockPrisma.project.findUnique.mockReset();
      mockPrisma.project.create.mockReset();
    });

    it('throws ConflictException when a project with the same name exists', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'existing',
        name: 'Alpha',
      });

      await expect(
        service.create(userId, { name: 'Alpha' } as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
        where: { name: 'Alpha' },
      });
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });

    it('creates the project when no duplicate exists', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue(
        makeProject({ name: 'Unique' }),
      );

      const result = await service.create(userId, { name: 'Unique' } as any);

      expect(result.name).toBe('Unique'); // makeProject with name override — we only care that create was reached
      expect(mockPrisma.project.create).toHaveBeenCalled();
    });

    it('throws ConflictException when prisma.create rejects with P2002 (race fallback)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockRejectedValue({ code: 'P2002' });

      const promise = service.create(userId, { name: 'Racey' } as any);
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.create(userId, { name: 'Racey' } as any),
      ).rejects.toThrow('A project with this name already exists');
    });

    it('rethrows non-Prisma errors from create unchanged', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      const bang = new Error('boom');
      mockPrisma.project.create.mockRejectedValue(bang);

      await expect(
        service.create(userId, { name: 'Kaboomy' } as any),
      ).rejects.toThrow('boom');
      await expect(
        service.create(userId, { name: 'Kaboomy' } as any),
      ).rejects.not.toBeInstanceOf(ConflictException);
    });
  });

  describe('update — duplicate name', () => {
    const projectId = 'proj-1';

    beforeEach(() => {
      mockPrisma.project.findUnique.mockReset();
      mockPrisma.project.update.mockReset();
    });

    it('throws ConflictException when renaming to an existing name', async () => {
      mockPrisma.project.findUnique
        .mockResolvedValueOnce({
          id: projectId,
          name: 'Alpha',
          active: true,
          campaigns: [],
        })
        .mockResolvedValueOnce({ id: 'other', name: 'Beta' });

      await expect(
        service.update(projectId, { name: 'Beta' } as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it('skips duplicate check when the name is unchanged', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: projectId,
        name: 'Alpha',
        active: true,
        campaigns: [],
      });
      mockPrisma.project.update.mockResolvedValue(
        makeProject({ name: 'Alpha' }),
      );

      await service.update(projectId, { name: 'Alpha' } as any);

      expect(mockPrisma.project.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.project.update).toHaveBeenCalled();
    });

    it('allows renaming when the new name is unique', async () => {
      mockPrisma.project.findUnique
        .mockResolvedValueOnce({
          id: projectId,
          name: 'Alpha',
          active: true,
          campaigns: [],
        })
        .mockResolvedValueOnce(null);
      mockPrisma.project.update.mockResolvedValue(
        makeProject({ name: 'Gamma' }),
      );

      await service.update(projectId, { name: 'Gamma' } as any);

      expect(mockPrisma.project.update).toHaveBeenCalled();
    });

    it('throws ConflictException when prisma.update rejects with P2002 (race fallback)', async () => {
      mockPrisma.project.findUnique
        .mockResolvedValueOnce({
          id: projectId,
          name: 'Alpha',
          active: true,
          campaigns: [],
        })
        .mockResolvedValueOnce(null);
      mockPrisma.project.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.update(projectId, { name: 'Gamma' } as any),
      ).rejects.toBeInstanceOf(ConflictException);

      mockPrisma.project.findUnique
        .mockResolvedValueOnce({
          id: projectId,
          name: 'Alpha',
          active: true,
          campaigns: [],
        })
        .mockResolvedValueOnce(null);
      await expect(
        service.update(projectId, { name: 'Gamma' } as any),
      ).rejects.toThrow('A project with this name already exists');
    });

    it('rethrows non-Prisma errors from update unchanged', async () => {
      mockPrisma.project.findUnique
        .mockResolvedValueOnce({
          id: projectId,
          name: 'Alpha',
          active: true,
          campaigns: [],
        })
        .mockResolvedValueOnce(null);
      mockPrisma.project.update.mockRejectedValue(new Error('kaboom'));

      await expect(
        service.update(projectId, { name: 'Gamma' } as any),
      ).rejects.toThrow('kaboom');

      mockPrisma.project.findUnique
        .mockResolvedValueOnce({
          id: projectId,
          name: 'Alpha',
          active: true,
          campaigns: [],
        })
        .mockResolvedValueOnce(null);
      await expect(
        service.update(projectId, { name: 'Gamma' } as any),
      ).rejects.not.toBeInstanceOf(ConflictException);
    });
  });
});
