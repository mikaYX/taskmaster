import { Matches } from 'class-validator';

export class ExchangeGuestTicketDto {
  /** 32 random bytes, hex encoded. */
  @Matches(/^[a-f0-9]{64}$/, { message: 'Invalid link' })
  ticket!: string;
}
