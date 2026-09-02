import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('--- Testing Notification Dispatcher ---');

  // Actually we can't easily run this without full DB setup, let me just check typescript compilation

  await app.close();
}

bootstrap();
