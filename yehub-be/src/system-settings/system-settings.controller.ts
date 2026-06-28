import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { SystemSettingsService } from './system-settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@ApiTags('System Settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get('public')
  @ApiOperation({
    summary: 'Public system settings (branding, etc.) — no auth required',
  })
  getPublic() {
    return this.settings.getPublicSettings();
  }

  @Get()
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all system settings (admin only)' })
  listAll() {
    return this.settings.listAll();
  }

  @Put(':key')
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update a system setting (admin only)' })
  upsert(@Param('key') key: string, @Body() dto: UpsertSettingDto) {
    return this.settings.upsert(key, dto);
  }
}
