import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GlobalRole, ProjectRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignRolesGuard } from '../auth/guards/campaign-roles.guard';
import { PostRolesGuard } from '../auth/guards/post-roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { PostsService } from './posts.service';
import { AddPostDto } from './dto/add-post.dto';
import { UpdatePostSettingsDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { SyncPostDto } from './dto/sync-post.dto';

@ApiTags('Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get('posts')
  @ApiOperation({ summary: 'List posts across all user campaigns' })
  findAllPosts(
    @CurrentUser() user: JwtUser,
    @Query() query: ListPostsQueryDto,
  ) {
    return this.postsService.findAllPosts(
      user.id,
      query,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Post('campaigns/:campaignId/posts')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Add a post by URL to a campaign' })
  addPost(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: AddPostDto,
  ) {
    return this.postsService.addPost(campaignId, dto);
  }

  @Post('campaigns/:campaignId/posts/bulk')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk upload posts via CSV or Excel' })
  bulkUpload(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @UploadedFile()
    file: { mimetype: string; originalname: string; buffer: Buffer },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const name = file.originalname.toLowerCase();
    const isCsv = name.endsWith('.csv') || file.mimetype === 'text/csv';
    const isXlsx =
      name.endsWith('.xlsx') ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!isCsv && !isXlsx) {
      throw new BadRequestException('Only CSV and Excel files are allowed');
    }
    return this.postsService.bulkUpload(campaignId, file);
  }

  @Get('campaigns/:campaignId/posts/export')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Export campaign posts as an Excel file' })
  async exportPosts(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: ListPostsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.postsService.exportPosts(
      campaignId,
      query,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('campaigns/:campaignId/posts')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'List posts for a campaign' })
  findAll(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: ListPostsQueryDto,
  ) {
    return this.postsService.findAll(campaignId, query);
  }

  @Get('posts/:id')
  @UseGuards(PostRolesGuard)
  @ApiOperation({ summary: 'Get a single post by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findOne(id);
  }

  @Put('posts/:id/settings')
  @UseGuards(PostRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Update post polling intervals and KPI targets' })
  updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostSettingsDto,
  ) {
    return this.postsService.updateSettings(id, dto);
  }

  @Post('posts/:id/sync')
  @UseGuards(PostRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue an immediate poll for a post' })
  syncNow(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SyncPostDto) {
    return this.postsService.syncNow(id, dto);
  }

  @Delete('posts/:id')
  @UseGuards(PostRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a post' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.remove(id);
  }
}
