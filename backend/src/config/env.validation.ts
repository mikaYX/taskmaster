import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Environment configuration validation.
 *
 * Security requirement: AUTH_SECRET must be defined with minimum 32 characters.
 * The application will fail to start without proper configuration.
 */
enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsOptional()
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  PORT = 3000;

  @IsString()
  @MinLength(32, {
    message: 'AUTH_SECRET must be at least 32 characters long',
  })
  AUTH_SECRET!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  AUTH_GRACE_WINDOW_ENABLED = true;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(60)
  AUTH_GRACE_WINDOW_SECONDS = 10;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  BACKUP_STORAGE_PATH?: string;

  @IsOptional()
  @IsString()
  BACKUP_ENCRYPTION_KEY?: string;

  // Web Push (VAPID) — générer avec : npx web-push generate-vapid-keys
  @IsOptional()
  @IsString()
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_CONTACT?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL = 'info';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  PROCEDURE_MAX_SIZE_MB = 5;

  @IsOptional()
  @IsString()
  VERSION_CHECK_REPO?: string;

  @IsOptional()
  @IsString()
  @MinLength(16, {
    message: 'BOOTSTRAP_SECRET must be at least 16 characters long',
  })
  BOOTSTRAP_SECRET?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => Object.values(error.constraints || {}).join(', '))
      .join('\n');
    const hint = errorMessages.includes('AUTH_SECRET')
      ? '\n→ Définir AUTH_SECRET dans le .env (min 32 caractères). Générer : openssl rand -base64 32'
      : '';
    throw new Error(`Environment validation failed:\n${errorMessages}${hint}`);
  }

  // Strict Production Checks
  if (validatedConfig.NODE_ENV === Environment.Production) {
    const missing: string[] = [];
    if (!validatedConfig.CORS_ORIGIN) missing.push('CORS_ORIGIN');
    if (!validatedConfig.BACKUP_ENCRYPTION_KEY)
      missing.push('BACKUP_ENCRYPTION_KEY');
    if (!validatedConfig.BOOTSTRAP_SECRET)
      missing.push('BOOTSTRAP_SECRET');

    if (missing.length > 0) {
      throw new Error(`Running in PRODUCTION requires: ${missing.join(', ')}`);
    }
  }

  return validatedConfig;
}

export { EnvironmentVariables, Environment };
