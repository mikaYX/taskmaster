import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

/**
 * Setup Module.
 *
 * Handles first-time application setup.
 * Public endpoints (no auth required).
 */
@Module({
  controllers: [SetupController],
  providers: [SetupService],
  exports: [SetupService],
})
export class SetupModule {}
