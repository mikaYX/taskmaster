import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NotificationsService } from './notifications/notifications.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const notificationsService = app.get(NotificationsService);
  const prisma = app.get(PrismaService);

  console.log('--- Testing Notification Dispatcher ---');

  // 1. We just test the email building part to see if it doesn't crash
  const task = {
    name: 'Test Task',
    description: 'This is a test task for notifications',
  };

  // Actually we can't easily run this without full DB setup, let me just check typescript compilation

  await app.close();
}

bootstrap();
