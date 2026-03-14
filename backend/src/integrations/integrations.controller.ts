import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { IncomingWebhookDto } from './dto/incoming-webhook.dto';
import { CompositeAuthGuard } from '../auth/guards/composite-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Integrations')
@Controller('integrations')
@UseGuards(CompositeAuthGuard)
@ApiBearerAuth('JWT-auth')
@ApiSecurity('Api-Key')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post('webhooks/incoming')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Universal webhook endpoint for external integrations',
    description:
      'Process incoming payloads from Zapier, n8n, Power Automate, Salesforce, Google Sheets, etc. Supports API Key authentication.',
  })
  async processWebhook(
    @Body() dto: IncomingWebhookDto,
    @CurrentUser() user: any,
  ) {
    return this.integrationsService.processIncomingWebhook(dto, user);
  }
}
