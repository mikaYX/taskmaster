
import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';

describe('CSV Injection Protection (M3)', () => {
    let service: ExportService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExportService,
                {
                    provide: PrismaService,
                    useValue: {
                        client: {
                            user: { findMany: jest.fn() },
                            task: { findMany: jest.fn() },
                            group: { findMany: jest.fn() },
                        },
                    },
                },
                {
                    provide: EncryptionService,
                    useValue: {},
                },
            ],
        }).compile();

        service = module.get<ExportService>(ExportService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('should escape dangerous characters at the start of a cell', () => {
        const payload = [
            { name: '=1+2', bio: '+Add', city: '-Paris', email: '@internal' },
            { name: 'Normal', bio: 'Healthy', city: 'Lyon', email: 'test@example.com' }
        ];

        const csv = (service as any).toCSV(payload);
        const lines = csv.split('\n');
        
        // Header check
        expect(lines[0]).toBe('name,bio,city,email');

        // Escaped row check
        const fields = lines[1].split(',');
        expect(fields[0]).toBe("'=1+2");
        expect(fields[1]).toBe("'+Add");
        expect(fields[2]).toBe("'-Paris");
        expect(fields[3]).toBe("'@internal");
        
        // Second row check (normal)
        const normalFields = lines[2].split(',');
        expect(normalFields[0]).toBe('Normal');
        expect(normalFields[3]).toBe('test@example.com');
    });

    it('should correctly handle normal text starting with safe characters', () => {
        const payload = [{ name: 'Test', value: '123' }];
        const csv = (service as any).toCSV(payload);
        expect(csv).toContain('Test,123');
        expect(csv).not.toContain("'Test");
    });
});
