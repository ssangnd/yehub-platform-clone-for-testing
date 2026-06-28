import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from '../auth/guards/global-roles.guard';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { CostService } from './cost.service';
import { CostQueryDto } from './dto/cost-query.dto';

@ApiTags('Cost')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.ADMIN)
@Controller('cost')
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get('filter-options')
  @ApiOperation({ summary: 'Projects and campaigns for Cost Explorer filters' })
  getFilterOptions() {
    return this.costService.getFilterOptions();
  }

  @Get()
  @ApiOperation({ summary: 'Aggregated Apify spend overview' })
  getOverview(@Query() query: CostQueryDto) {
    return this.costService.getOverview(query);
  }
}
