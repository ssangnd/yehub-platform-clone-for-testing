import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPost(postId: string, query: ListCommentsQueryDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deleted_at: true },
    });
    if (!post || post.deleted_at) throw new NotFoundException('Post not found');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CommentWhereInput = {
      post_id: postId,
      ...(query.q && {
        content: { contains: query.q, mode: 'insensitive' as const },
      }),
      ...(query.platform && { platform: query.platform }),
      ...(query.sentiment && { sentiment: query.sentiment }),
      ...(query.is_noise !== undefined && { is_noise: query.is_noise }),
      ...(query.from || query.to
        ? {
            platform_created_at: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };

    const orderBy = this.getOrderBy(query.sort);

    const [comments, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      data: comments,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findByCampaign(campaignId: string, query: ListCommentsQueryDto) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, deleted_at: true },
    });
    if (!campaign || campaign.deleted_at)
      throw new NotFoundException('Campaign not found');

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CommentWhereInput = {
      post: { campaign_id: campaignId, deleted_at: null },
      ...(query.q && {
        content: { contains: query.q, mode: 'insensitive' as const },
      }),
      ...(query.platform && { platform: query.platform }),
      ...(query.sentiment && { sentiment: query.sentiment }),
      ...(query.is_noise !== undefined && { is_noise: query.is_noise }),
      ...(query.from || query.to
        ? {
            platform_created_at: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };

    const orderBy = this.getOrderBy(query.sort);

    const [comments, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: {
          post: { select: { id: true, url: true, platform: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      data: comments,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        childComments: {
          orderBy: { platform_created_at: 'asc' },
        },
      },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private getOrderBy(sort?: string): Prisma.CommentOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { platform_created_at: 'asc' };
      case 'most_likes':
        return { like_count: 'desc' };
      default:
        return { platform_created_at: 'desc' };
    }
  }
}
