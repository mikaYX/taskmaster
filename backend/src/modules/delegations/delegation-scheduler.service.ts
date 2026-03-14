import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BeneficiaryResolverService } from './beneficiary-resolver.service';

import { EmailService } from '../../email/email.service';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class DelegationSchedulerService {
  private readonly logger = new Logger(DelegationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beneficiaryResolver: BeneficiaryResolverService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'delegation-expiry' })
  async handleExpiredDelegations() {
    const schedulerEnabled =
      await this.settingsService.getRawValue<boolean>('scheduler.enabled');
    if (!schedulerEnabled) {
      return;
    }

    this.logger.debug('Checking for recently expired delegations...');

    const now = new Date();

    // 1. Find delegations that JUST expired natively and haven't been notified
    const expiredDelegations = await this.prisma.client.taskDelegation.findMany(
      {
        where: {
          endAt: { lte: now },
          expiredNotifiedAt: null,
        },
        include: {
          targetUsers: true,
          targetGroups: true,
        },
      },
    );

    if (expiredDelegations.length === 0) {
      return;
    }

    this.logger.log(
      `Found ${expiredDelegations.length} expired delegations to notify.`,
    );

    // 2. Process each expired delegation
    for (const delegation of expiredDelegations) {
      try {
        // Idempotency: try to lock/update immediately so another instance (if scaled) doesn't catch it
        const updated = await this.prisma.client.taskDelegation.updateMany({
          where: {
            id: delegation.id,
            expiredNotifiedAt: null, // Optimistic lock pattern
          },
          data: {
            expiredNotifiedAt: new Date(),
          },
        });

        if (updated.count === 0) {
          // Already claimed by another worker
          continue;
        }

        // Resolve final list of users to notify, deduplicating direct users & group members
        const uniqueUserIdsToNotify =
          await this.beneficiaryResolver.resolveBeneficiaryUserIdsFromDelegation(
            delegation,
          );

        this.logger.log(
          `Notify expiration for delegation ${delegation.id} to users: [${uniqueUserIdsToNotify.join(', ')}] and author ${delegation.delegatedById}`,
        );

        const idsToInclude = [...uniqueUserIdsToNotify];
        if (delegation.delegatedById) {
          idsToInclude.push(delegation.delegatedById);
        }
        const userIdsToFetch = Array.from(new Set(idsToInclude));

        const usersToNotify = await this.prisma.client.user.findMany({
          where: { id: { in: userIdsToFetch }, email: { not: null } },
          select: { email: true, id: true },
        });

        const emails = usersToNotify
          .map((u) => u.email)
          .filter(Boolean) as string[];

        if (emails.length > 0) {
          await this.emailService.send({
            to: emails,
            subject: `Expiration de votre délégation (Tâche #${delegation.taskId})`,
            text: `Bonjour,\n\nVotre délégation concernant la Tâche #${delegation.taskId} a expiré aujourd'hui.\n\nCordialement,\nTaskmaster.`,
          });
        }
      } catch (error) {
        this.logger.error(
          `Error processing expiration for delegation ${delegation.id}`,
          error,
        );
      }
    }
  }
}
