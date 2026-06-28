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
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListProfilesQueryDto } from './dto/list-profiles-query.dto';
import { LinkAccountDto } from './dto/link-account.dto';
import { MoveAccountDto } from './dto/move-account.dto';

@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'List profiles' })
  findAll(@Query() query: ListProfilesQueryDto) {
    return this.profilesService.findAll(query);
  }

  @Get('tags')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'List all distinct profile tags' })
  listTags() {
    return this.profilesService.listTags();
  }

  @Get(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Get profile detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.findOne(id);
  }

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Create a profile' })
  create(@Body() dto: CreateProfileDto) {
    return this.profilesService.create(dto);
  }

  @Put(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Update a profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a profile' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.remove(id);
  }

  // ─── Social Accounts ──────────────────────────────────────────────

  @Post(':id/accounts')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Link a social account to a profile' })
  linkAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkAccountDto,
  ) {
    return this.profilesService.linkAccount(id, dto);
  }

  @Delete(':id/accounts/:accountId')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink a social account from a profile' })
  unlinkAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.profilesService.unlinkAccount(id, accountId);
  }

  @Patch(':id/accounts/:accountId/move')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Move a social account to another profile' })
  moveAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: MoveAccountDto,
  ) {
    return this.profilesService.moveAccount(id, accountId, dto);
  }

  @Post(':id/accounts/:accountId/poll')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger a refresh poll of a social account' })
  pollAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.profilesService.pollAccount(id, accountId);
  }
}
