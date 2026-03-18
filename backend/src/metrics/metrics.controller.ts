import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { Response } from 'express';
import { LocalNetworkGuard } from '../common/guards/local-network.guard';

@Controller('metrics')
@UseGuards(LocalNetworkGuard)
export class MetricsController extends PrometheusController {
  @Get()
  async index(@Res({ passthrough: true }) response: Response) {
    return super.index(response);
  }
}
