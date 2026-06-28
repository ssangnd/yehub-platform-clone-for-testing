import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignRolesGuard } from '../auth/guards/campaign-roles.guard';
import { PostRolesGuard } from '../auth/guards/post-roles.guard';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

describe('PostsController.exportPosts', () => {
  let controller: PostsController;
  const serviceMock = {
    exportPosts: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CampaignRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PostRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PostsController);
  });

  it('sets download headers and returns a StreamableFile', async () => {
    serviceMock.exportPosts.mockResolvedValue({
      buffer: Buffer.from('xlsx-bytes'),
      filename: 'summer-push-posts.xlsx',
    });
    const res = { set: jest.fn() } as never;

    const result = await controller.exportPosts('camp-1', {}, res);

    expect(serviceMock.exportPosts).toHaveBeenCalledWith('camp-1', {});
    expect((res as { set: jest.Mock }).set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="summer-push-posts.xlsx"',
      }),
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
