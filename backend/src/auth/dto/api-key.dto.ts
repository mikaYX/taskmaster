import { IsString, IsOptional, IsArray, IsEnum, IsDateString, MinLength } from 'class-validator';
import { Permission } from '../permissions.enum';

export class CreateApiKeyDto {
    @IsString()
    @MinLength(3)
    name!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsArray()
    @IsEnum(Permission, { each: true })
    scopes!: string[];

    @IsOptional()
    @IsDateString()
    expiresAt?: string;
}
