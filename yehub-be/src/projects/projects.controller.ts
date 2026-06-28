import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectRole, GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../auth/guards/project-roles.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { GetNonMembersQueryDto } from './dto/get-non-members-query.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Create a project (admin/internal_user only)' })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List projects the user is a member of (admin sees all)',
  })
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListProjectsQueryDto) {
    return this.projectsService.findAll(
      user.id,
      query,
      user.role === GlobalRole.ADMIN,
    );
  }

  @Get(':id')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: 'Get project detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Update project (manager only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive project (manager only)' })
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.archive(id);
  }

  @Post(':id/unarchive')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Unarchive project (manager only)' })
  unarchive(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.unarchive(id);
  }

  @Get(':id/me')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: "Get the current user's role in a project" })
  getMyRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.getMyRole(id, user.id);
  }

  @Get(':id/members')
  @UseGuards(ProjectRolesGuard)
  @ApiOperation({ summary: 'List project members' })
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listMembers(id);
  }

  @Get(':id/non-members')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'List users not in this project (manager only)' })
  getNonMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetNonMembersQueryDto,
  ) {
    return this.projectsService.getNonMembers(id, query);
  }

  @Post(':id/members')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: 'Add a member (manager only)' })
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.projectsService.addMember(id, dto);
  }

  @Patch(':id/members/:userId')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @ApiOperation({ summary: "Update a member's role (manager only)" })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.updateMember(id, userId, dto.role, user.id);
  }

  @Delete(':id/members/:userId')
  @UseGuards(ProjectRolesGuard)
  @Roles(ProjectRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member (manager only)' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.removeMember(id, userId, user.id);
  }
}
