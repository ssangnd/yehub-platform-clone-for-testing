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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Create category (admin only)' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto.name);
  }

  @Put(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Rename category (admin only)' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.rename(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
