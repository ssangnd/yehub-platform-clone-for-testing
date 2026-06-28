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
import { ObjectivesService } from './objectives.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';

@ApiTags('Objectives')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('objectives')
export class ObjectivesController {
  constructor(private readonly objectivesService: ObjectivesService) {}

  @Get()
  @ApiOperation({ summary: 'List all objectives with campaign counts' })
  findAll() {
    return this.objectivesService.findAll();
  }

  @Post()
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Create objective (admin only)' })
  create(@Body() dto: CreateObjectiveDto) {
    return this.objectivesService.create(dto.name);
  }

  @Put(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @ApiOperation({ summary: 'Rename objective (admin only)' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateObjectiveDto,
  ) {
    return this.objectivesService.rename(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(GlobalRolesGuard)
  @GlobalRoles(GlobalRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete objective (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectivesService.remove(id);
  }
}
