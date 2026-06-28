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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { KolTiersService } from './kol-tiers.service';
import { CreateKolTierDto } from './dto/create-kol-tier.dto';
import { UpdateKolTierDto } from './dto/update-kol-tier.dto';

@ApiTags('KOL Tiers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kol-tiers')
export class KolTiersController {
  constructor(private readonly kolTiersService: KolTiersService) {}

  @Get()
  @ApiOperation({ summary: 'List all KOL tiers' })
  findAll() {
    return this.kolTiersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a KOL tier by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kolTiersService.findOne(id);
  }

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Create KOL tier (admin or internal user)' })
  create(@Body() dto: CreateKolTierDto) {
    return this.kolTiersService.create(dto);
  }

  @Put(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Update KOL tier (admin or internal user)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKolTierDto,
  ) {
    return this.kolTiersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete KOL tier (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.kolTiersService.remove(id);
  }
}
