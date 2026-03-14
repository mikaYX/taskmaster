import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { GetHolidaysDto, HolidaysResponseDto } from './dto';
import { JwtAuthGuard } from '../auth';
import { SettingsService } from '../settings';

/**
 * Holidays Controller.
 *
 * Returns public holidays for supported countries.
 */
@Controller('holidays')
@UseGuards(JwtAuthGuard)
export class HolidaysController {
  constructor(
    private readonly holidaysService: HolidaysService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get()
  async getHolidays(
    @Query() query: GetHolidaysDto,
  ): Promise<HolidaysResponseDto> {
    const year = query.year || new Date().getFullYear();
    // Preview is stateless: use query param or default to FR
    const country = query.country || 'FR';

    return this.holidaysService.getHolidays(country, year);
  }
}
