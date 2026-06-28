import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignRolesGuard } from '../auth/guards/campaign-roles.guard';
import { PostRolesGuard } from '../auth/guards/post-roles.guard';
import { CommentRolesGuard } from '../auth/guards/comment-roles.guard';
import { CommentsService } from './comments.service';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';

@ApiTags('Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('posts/:id/comments')
  @UseGuards(PostRolesGuard)
  @ApiOperation({ summary: 'List comments for a post' })
  findByPost(
    @Param('id', ParseUUIDPipe) postId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.findByPost(postId, query);
  }

  @Get('campaigns/:campaignId/comments')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'List comments for a campaign' })
  findByCampaign(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.findByCampaign(campaignId, query);
  }

  @Get('comments/:id')
  @UseGuards(CommentRolesGuard)
  @ApiOperation({ summary: 'Get a comment with its replies' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.commentsService.findOne(id);
  }
}
