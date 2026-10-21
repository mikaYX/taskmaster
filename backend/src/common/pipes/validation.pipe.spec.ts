import { BadRequestException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { GlobalValidationPipe } from './validation.pipe';

class OptionalDto {
  @IsOptional()
  @IsString()
  name?: string;
}

class RequiredDto {
  @IsString()
  name!: string;
}

describe('GlobalValidationPipe', () => {
  const pipe = new GlobalValidationPipe();

  it('treats a missing body as an empty object for an all-optional DTO', async () => {
    const result = await pipe.transform(undefined, {
      type: 'body',
      metatype: OptionalDto,
    });
    expect(result).toBeInstanceOf(OptionalDto);
  });

  it('answers 400, not 500, when a required body is missing', async () => {
    await expect(
      pipe.transform(undefined, { type: 'body', metatype: RequiredDto }),
    ).rejects.toThrow(BadRequestException);
  });

  it('still rejects properties the DTO does not declare', async () => {
    await expect(
      pipe.transform(
        { name: 'ok', extra: true },
        { type: 'body', metatype: OptionalDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
