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
import { KolCategoriesService } from './kol-categories.service';
import { CreateKolCategoryDto } from './dto/create-kol-category.dto';
import { UpdateKolCategoryDto } from './dto/update-kol-category.dto';

@ApiTags('KOL Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kol-categories')
export class KolCategoriesController {
  constructor(private readonly kolCategoriesService: KolCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all KOL categories' })
  findAll() {
    return this.kolCategoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a KOL category by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kolCategoriesService.findOne(id);
  }

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Create KOL category (admin or internal user)' })
  create(@Body() dto: CreateKolCategoryDto) {
    return this.kolCategoriesService.create(dto);
  }

  @Put(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN, GlobalRole.INTERNAL_USER)
  @ApiOperation({ summary: 'Update KOL category (admin or internal user)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKolCategoryDto,
  ) {
    return this.kolCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete KOL category (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.kolCategoriesService.remove(id);
  }
}
