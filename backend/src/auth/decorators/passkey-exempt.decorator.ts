import { SetMetadata } from '@nestjs/common';

export const IS_PASSKEY_EXEMPT_KEY = 'isPasskeyExempt';
export const PasskeyExempt = () => SetMetadata(IS_PASSKEY_EXEMPT_KEY, true);
