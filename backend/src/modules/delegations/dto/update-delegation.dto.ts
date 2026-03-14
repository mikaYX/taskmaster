import { PartialType } from '@nestjs/mapped-types';
import { CreateDelegationDto } from './create-delegation.dto';

export class UpdateDelegationDto extends PartialType(CreateDelegationDto) {}
