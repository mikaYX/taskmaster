import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Client } from 'ldapts';
import { SettingsService } from '../settings/settings.service';
import { TestLdapConnectionDto } from '../settings/dto/test-ldap.dto';

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Authenticate a user against LDAP.
   * Prompts the LDAP server to bind with the given username and password.
   * If successful, fetches the user's profile information.
   *
   * @param username The username (often email or sAMAccountName)
   * @param password The raw password
   * @returns Profile data if successful, null if LDAP is disabled or auth fails.
   */
  async authenticate(
    username: string,
    password: string,
  ): Promise<{ username: string; email: string; fullname: string } | null> {
    const isEnabled = await this.settingsService.getRawValue<string>(
      'auth.ldap.enabled' as any,
    );
    if (isEnabled !== 'true') {
      return null; // LDAP not active
    }

    const url = await this.settingsService.getRawValue<string>(
      'auth.ldap.url' as any,
    );
    const bindDn = await this.settingsService.getRawValue<string>(
      'auth.ldap.bindDn' as any,
    );
    const bindPassword = await this.settingsService.getRawValue<string>(
      'auth.ldap.bindPassword' as any,
    );
    const searchBase = await this.settingsService.getRawValue<string>(
      'auth.ldap.searchBase' as any,
    );
    const searchFilterTemplate = await this.settingsService.getRawValue<string>(
      'auth.ldap.searchFilter' as any,
    );

    if (!url || !searchBase || !searchFilterTemplate) {
      this.logger.warn(
        'LDAP is enabled but missing configuration (URL, Base, Filter).',
      );
      return null;
    }

    const client = new Client({ url, timeout: 5000 });

    try {
      // 1. Initial bind (service account or anonymous if left empty)
      if (bindDn && bindPassword) {
        await client.bind(bindDn, bindPassword);
      }

      // 2. Search for the user to get their actual DN
      const searchFilter = searchFilterTemplate
        .replace('{{username}}', username)
        .replace('{{usermail}}', username);
      const { searchEntries } = await client.search(searchBase, {
        filter: searchFilter,
        scope: 'sub',
        attributes: [
          'dn',
          'mail',
          'displayName',
          'cn',
          'sAMAccountName',
          'uid',
        ],
      });

      if (searchEntries.length === 0) {
        this.logger.debug(
          `LDAP Search yielded no results for filter: ${searchFilter}`,
        );
        await client.unbind();
        return null;
      }

      const userEntry = searchEntries[0];
      const userDn = userEntry.dn;

      // 3. Bind with the user's explicit DN and provided password to verify credentials
      // Note: We create a fresh client to avoid state issues or we can unbind and rebind
      const userClient = new Client({ url, timeout: 5000 });
      try {
        await userClient.bind(userDn, password);
        await userClient.unbind();
      } catch (bindErr: any) {
        this.logger.warn(
          `LDAP bind failed for user ${username}: ${bindErr.message}`,
        );
        await userClient.unbind().catch(() => {});
        return null; // Password incorrect
      }

      await client.unbind();

      // Ensure a valid email
      const email =
        typeof userEntry.mail === 'string'
          ? userEntry.mail
          : Array.isArray(userEntry.mail)
            ? userEntry.mail[0]
            : username;

      // Ensure a valid fullname
      const fullname =
        typeof userEntry.displayName === 'string'
          ? userEntry.displayName
          : typeof userEntry.cn === 'string'
            ? userEntry.cn
            : username;

      const emailStr = String(email).toLowerCase();
      return {
        username: emailStr, // often systems use email as the taskmaster username
        email: emailStr,
        fullname: String(fullname),
      };
    } catch (error: any) {
      this.logger.error(
        `LDAP Integration error: ${error.message}`,
        error.stack,
      );
      try {
        await client.unbind();
      } catch (e) {
        // ignore unbind error
      }
      return null;
    }
  }

  /**
   * Test an LDAP connection with provided configuration before saving.
   */
  async testConnection(
    dto: TestLdapConnectionDto,
  ): Promise<{ success: boolean; message: string }> {
    const { url, bindDn, bindPassword, searchBase, searchFilter } = dto;
    const client = new Client({ url, timeout: 5000 });

    try {
      if (bindDn && bindPassword) {
        await client.bind(bindDn, bindPassword);
      } else {
        // Anonymous bind attempt
        await client.bind('', '');
      }

      if (searchBase && searchFilter) {
        const testFilter = searchFilter
          .replace('{{username}}', 'testUser')
          .replace('{{usermail}}', 'testUser');
        await client.search(searchBase, {
          filter: testFilter,
          scope: 'sub',
          attributes: ['dn'],
          sizeLimit: 1,
        });
      }

      await client.unbind();
      return { success: true, message: 'LDAP connection successful.' };
    } catch (error: any) {
      this.logger.error(`LDAP Test Connection Error: ${error.message}`);
      try {
        await client.unbind();
      } catch (e) {
        // ignore unbind error
      }
      return { success: false, message: error.message };
    }
  }
}
