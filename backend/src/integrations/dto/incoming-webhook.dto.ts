import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IncomingWebhookDto {
  @ApiProperty({
    description: 'The source of the integration',
    example: 'Zapier',
  })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({
    description: 'Action to perform',
    example: 'COMPLETE_TASK',
    enum: ['COMPLETE_TASK', 'CREATE_TASK'],
  })
  @IsString()
  @IsIn(['COMPLETE_TASK', 'CREATE_TASK'])
  action!: string;

  @ApiProperty({
    description: 'Dynamic payload data',
    required: false,
    type: Object,
  })
  @IsOptional()
  @IsObject()
  payload?: any;
}
