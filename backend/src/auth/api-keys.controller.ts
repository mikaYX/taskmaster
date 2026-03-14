import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
    ParseIntPipe,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { JwtAuthGuard, RolesGuard } from './guards';
import { Roles } from './decorators';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

/**
 * API Keys Controller.
 * 
 * Management of system tokens for external integrations.
 * Restricted to SUPER_ADMIN to prevent elevation.
 */
@ApiTags('Auth / API Keys')
@ApiBearerAuth()
@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class ApiKeysController {
    private readonly logger = new Logger(ApiKeysController.name);

    constructor(private readonly apiKeysService: ApiKeysService) { }

    @Get()
    @ApiOperation({ summary: 'List all API keys' })
    @ApiResponse({ status: 200, description: 'Return all API keys meta-data' })
    @Audit({
        action: AuditAction.API_KEY_LIST,
        category: AuditCategory.AUTH,
    })
    async list() {
        try {
            return await this.apiKeysService.list();
        } catch (err) {
            this.logger.error('api-keys list failed', err instanceof Error ? err.stack : err);
            throw new InternalServerErrorException(
                'Unable to list API keys. Ensure database migrations have been applied (e.g. api_keys table exists).',
            );
        }
    }

    @Post()
    @ApiOperation({ summary: 'Create a new API key' })
    @ApiResponse({ status: 201, description: 'Return the RAW key and meta-data' })
    @Audit({
        action: AuditAction.API_KEY_CREATE,
        category: AuditCategory.AUTH,
    })
    async create(@Body() dto: CreateApiKeyDto) {
        return this.apiKeysService.createKey(
            dto.name,
            dto.description,
            dto.scopes,
            dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        );
    }

    @Post(':id/rotate')
    @ApiOperation({ summary: 'Rotate (regenerate) an API key' })
    @ApiResponse({ status: 200, description: 'Revokes old key and returns a NEW raw key' })
    @Audit({
        action: AuditAction.API_KEY_ROTATE,
        category: AuditCategory.AUTH,
    })
    @HttpCode(HttpStatus.OK)
    async rotate(@Param('id', ParseIntPipe) id: number) {
        return this.apiKeysService.rotate(id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Revoke and delete an API key' })
    @ApiResponse({ status: 204, description: 'Key is successfully revoked' })
    @Audit({
        action: AuditAction.API_KEY_REVOKE,
        category: AuditCategory.AUTH,
    })
    @HttpCode(HttpStatus.NO_CONTENT)
    async revoke(@Param('id', ParseIntPipe) id: number) {
        await this.apiKeysService.revoke(id);
    }
}
