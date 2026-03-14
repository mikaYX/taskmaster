import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
    Logger
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuthService } from '../auth';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import { randomBytes } from 'crypto';

@Injectable()
export class GuestsService {
    private readonly logger = new Logger(GuestsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly authService: AuthService,
        private readonly auditService: AuditService,
    ) { }

    /**
     * Get guest for a specific site.
     */
    async findBySite(siteId: number) {
        return this.prisma.client.user.findFirst({
            where: {
                role: UserRole.GUEST,
                deletedAt: null,
                sites: {
                    some: {
                        siteId: siteId,
                    },
                },
            },
        });
    }

    /**
     * Create a new guest for a site.
     * Enforces 1 active guest per site.
     */
    async createForSite(siteId: number, actor: { id: number; username: string }) {
        // 1. Check site existence
        const site = await this.prisma.client.site.findUnique({
            where: { id: siteId },
        });
        if (!site) {
            throw new NotFoundException(`Site with ID ${siteId} not found`);
        }

        // 2. Check existing guest
        const existing = await this.findBySite(siteId);
        if (existing) {
            throw new ConflictException(`An active guest already exists for site ${site.name}`);
        }

        // 3. Generate credentials
        const timestamp = Date.now();
        const username = `guest_${site.code.toLowerCase()}_${timestamp}`;
        const password = randomBytes(12).toString('hex');
        const passwordHash = await this.authService.hashPassword(password);

        // 4. Create user
        const guest = await this.prisma.client.user.create({
            data: {
                username,
                fullname: `TV Mode - ${site.name}`,
                email: `${username}@tv.local`,
                passwordHash,
                role: UserRole.GUEST,
                authProvider: 'LOCAL',
                mustChangePassword: false, // Guests don't change passwords
            }
        });

        // 5. Assign to site
        await this.prisma.client.userSiteAssignment.create({
            data: {
                userId: guest.id,
                siteId: siteId,
                isDefault: true,
            }
        });

        await this.auditService.log({
            action: AuditAction.USER_CREATED,
            actorId: actor.id,
            actorName: actor.username,
            target: `User:${guest.id}`,
            category: AuditCategory.USER,
            details: { site: site.name, message: 'Guest created for site' },
        });

        this.logger.log(`Guest created for site ${siteId}: ${username}`);

        return {
            ...guest,
            rawPassword: password, // Only returned once
        };
    }

    /**
     * Regenerate password for a guest.
     */
    async regeneratePassword(id: number, actor: { id: number; username: string }) {
        const guest = await this.prisma.client.user.findFirst({
            where: { id, role: UserRole.GUEST, deletedAt: null },
        });

        if (!guest) {
            throw new NotFoundException(`Guest with ID ${id} not found`);
        }

        const newPassword = randomBytes(12).toString('hex');
        const passwordHash = await this.authService.hashPassword(newPassword);

        await this.prisma.client.user.update({
            where: { id },
            data: { passwordHash },
        });

        await this.auditService.log({
            action: AuditAction.USER_PASSWORD_CHANGED,
            actorId: actor.id,
            actorName: actor.username,
            target: `User:${id}`,
            category: AuditCategory.USER,
            details: { message: 'Guest password regenerated' },
        });

        return {
            success: true,
            newPassword,
        };
    }

    /**
     * Revoke (soft-delete) a guest.
     */
    async revoke(id: number, actor: { id: number; username: string }) {
        const guest = await this.prisma.client.user.findFirst({
            where: { id, role: UserRole.GUEST, deletedAt: null },
        });

        if (!guest) {
            throw new NotFoundException(`Guest with ID ${id} not found`);
        }

        await this.prisma.client.user.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            action: AuditAction.USER_DELETED,
            actorId: actor.id,
            actorName: actor.username,
            target: `User:${id}`,
            category: AuditCategory.USER,
        });

        this.logger.log(`Guest revoked: ${id}`);
        return { success: true };
    }

    async listGuests() {
        return this.prisma.client.user.findMany({
            where: { role: UserRole.GUEST, deletedAt: null },
            include: {
                sites: {
                    include: {
                        site: { select: { name: true, code: true } }
                    }
                }
            }
        });
    }
}
