import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule provides the PrismaService globally.
 *
 * Justification: @Global() decorator ensures the PrismaService is available
 * throughout the application without needing to import in every module.
 * This is appropriate for database access which is a cross-cutting concern.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
