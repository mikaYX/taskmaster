import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(
    @Req() req: any,
    @Query('filterUserId') filterUserId?: string,
    @Query('filterGroupId') filterGroupId?: string,
  ) {
    const user = req.user;
    const fUserId = filterUserId ? parseInt(filterUserId, 10) : undefined;
    const fGroupId = filterGroupId ? parseInt(filterGroupId, 10) : undefined;

    return this.dashboardService.getStats(
      user.sub,
      user.groupIds || [],
      user.role === 'SUPER_ADMIN' || user.role === 'MANAGER',
      fUserId && !isNaN(fUserId) ? fUserId : undefined,
      fGroupId && !isNaN(fGroupId) ? fGroupId : undefined,
    );
  }
}
