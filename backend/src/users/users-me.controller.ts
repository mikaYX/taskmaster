import {
  Controller,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  UseInterceptors,
  UploadedFile,
  Logger,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { memoryStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { UsersService } from './users.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * Controller for "current user" (me) routes.
 * Mounted at /users/me so that POST /users/me/avatar is unambiguous and registered before /users/:id.
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'USER')
export class UsersMeController {
  private readonly logger = new Logger(UsersMeController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  @HttpCode(HttpStatus.OK)
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile(
      new FileValidationPipe({
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    )
    file: Express.Multer.File | undefined,
  ) {
    try {
      if (!file?.buffer) {
        throw new BadRequestException('No file uploaded');
      }
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `avatar-${user.sub}-${Date.now()}${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, file.buffer);
      const url = `/public/uploads/${filename}`;
      await this.usersService.updateAvatar(user.sub, url);
      return { url };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(
        `Avatar upload failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Avatar upload failed. Please try again.',
      );
    }
  }
}
