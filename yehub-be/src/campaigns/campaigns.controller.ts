import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole, ProjectRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../auth/guards/project-roles.guard';
import { CampaignRolesGuard } from '../auth/guards/campaign-roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CampaignsService } from './campaigns.service';
import { CampaignMetricKey } from './campaign-metrics';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ChangeCampaignStatusDto } from './dto/change-campaign-status.dto';
import { ListCampaignsQueryDto } from './dto/list-campaigns-query.dto';
import { AddCampaignMemberDto } from './dto/add-campaign-member.dto';
import { UpdateCampaignMemberDto } from './dto/update-campaign-member.dto';
import { GetCampaignNonMembersQueryDto } from './dto/get-campaign-non-members-query.dto';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post('projects/:projectId/campaigns')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Create a campaign within a project' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(projectId, dto);
  }

  @Get('projects/:projectId/campaigns')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: 'List campaigns for a project' })
  findAllByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListCampaignsQueryDto,
  ) {
    return this.campaignsService.findAllByProject(projectId, query);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List campaigns across all user projects' })
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListCampaignsQueryDto) {
    return this.campaignsService.findAll(
      user.id,
      query,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Get('campaigns/:id')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Get campaign detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Get('campaigns/:id/metrics/:metric')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({
    summary: 'Get a single aggregated campaign dashboard metric',
  })
  getMetric(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('metric', new ParseEnumPipe(CampaignMetricKey))
    metric: CampaignMetricKey,
  ) {
    return this.campaignsService.getMetric(id, metric);
  }

  @Get('campaigns/:id/analytics/comments-by-date')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({
    summary: 'Comment volume over the campaign window (time series)',
  })
  getCommentVolume(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getCommentVolume(id);
  }

  @Get('campaigns/:id/analytics/comments-by-platform')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Comment counts grouped by platform' })
  getCommentsByPlatform(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getCommentsByPlatform(id);
  }

  @Get('campaigns/:id/analytics/spending')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Apify usage and cost for the campaign' })
  getSpending(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.getSpending(id);
  }

  @Put('campaigns/:id')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Update campaign details' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, dto);
  }

  @Post('campaigns/:id/status')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER, ProjectRole.EXECUTIVE)
  @ApiOperation({ summary: 'Transition campaign status' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCampaignStatusDto,
  ) {
    return this.campaignsService.changeStatus(id, dto.status);
  }

  @Delete('campaigns/:id')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a campaign' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.remove(id);
  }

  @Get('campaigns/:id/me')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'Get my effective role for this campaign' })
  getMyRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.campaignsService.getMyRole(id, user.id);
  }

  @Get('campaigns/:id/members')
  @UseGuards(CampaignRolesGuard)
  @ApiOperation({ summary: 'List campaign members (inherited + direct)' })
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.listMembers(id);
  }

  @Get('campaigns/:id/non-members')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'List users available to add as campaign members' })
  getCampaignNonMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetCampaignNonMembersQueryDto,
  ) {
    return this.campaignsService.getCampaignNonMembers(id, query);
  }

  @Post('campaigns/:id/members')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Add a campaign member (manager only)' })
  addCampaignMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCampaignMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.campaignsService.addCampaignMember(id, dto, user.id);
  }

  @Patch('campaigns/:id/members/:userId')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Update campaign member role (manager only)' })
  updateCampaignMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateCampaignMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.campaignsService.updateCampaignMember(
      id,
      userId,
      dto.role,
      user.id,
    );
  }

  @Delete('campaigns/:id/members/:userId')
  @UseGuards(CampaignRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a campaign member (manager only)' })
  removeCampaignMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.campaignsService.removeCampaignMember(id, userId, user.id);
  }
}
