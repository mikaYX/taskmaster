import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { SetupGuard } from './setup.guard';

/**
 * Setup Module.
 *
 * Handles first-time application setup.
 * Public endpoints (no auth required), but protected by SetupGuard.
 */
@Module({
  controllers: [SetupController],
  providers: [SetupService, SetupGuard],
  exports: [SetupService],
})
export class SetupModule {}
