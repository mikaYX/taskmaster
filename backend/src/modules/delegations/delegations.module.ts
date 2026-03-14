import { Module } from '@nestjs/common';
import { DelegationsService } from './delegations.service';
import { DelegationsController } from './delegations.controller';
import { BeneficiaryResolverService } from './beneficiary-resolver.service';
import { DelegationSchedulerService } from './delegation-scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { EmailModule } from '../../email/email.module';
import { SettingsModule } from '../../settings/settings.module';

@Module({
  imports: [PrismaModule, AuditModule, EmailModule, SettingsModule],
  controllers: [DelegationsController],
  providers: [
    DelegationsService,
    BeneficiaryResolverService,
    DelegationSchedulerService,
  ],
  exports: [DelegationsService, BeneficiaryResolverService],
})
export class DelegationsModule {}
