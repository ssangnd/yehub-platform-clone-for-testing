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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateGlobalRoleDto } from './dto/update-global-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.ADMIN)
@Controller('admin/users')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a new user via email' })
  inviteUser(@CurrentUser() user: JwtUser, @Body() dto: InviteUserDto) {
    return this.adminService.inviteUser(dto, user.id);
  }

  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend invitation email to an invited user' })
  resendInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.resendInvitation(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details with project memberships' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: "Change user's global role" })
  updateRole(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGlobalRoleDto,
  ) {
    return this.adminService.updateGlobalRole(id, dto.role, user.id);
  }

  @Patch(':id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable user account' })
  disableUser(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.disableUser(id, user.id);
  }

  @Patch(':id/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enable user account' })
  enableUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.enableUser(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user permanently' })
  removeUser(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.removeUser(id, user.id);
  }

  @Delete(':id/memberships/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user from a project' })
  removeUserMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.adminService.removeUserMembership(id, projectId);
  }
}
