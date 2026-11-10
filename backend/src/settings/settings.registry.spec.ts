import { SETTINGS_REGISTRY, SETTING_KEYS } from './settings.registry';
import { PUBLIC_BRANDING_KEYS } from './settings.service';

// Deliberately independent of the registry: changes to anonymous exposure
// must update this explicit contract, not silently expand the endpoint.
const ORIGINAL_PUBLIC_KEYS = [
  'app.title',
  'app.subtitle',
  'app.showTitle',
  'app.showSubtitle',
  'app.logoUrl',
  'app.faviconUrl',
  'app.wallpaperUrl',
  'app.loginCardOpacity',
  'app.logoDarkUrl',
  'app.wallpaperBlur',
  'app.wallpaperDim',
  'app.loginWelcomeText',
  'app.loginMessage',
  'app.accentColor',
  'app.logoAlign',
  'app.textAlign',
  'ui.theme',
  'auth.generic.enabled',
  'auth.generic.oidc.providerName',
  'auth.passkeys.enabled',
  'addons.todolist.enabled',
];

describe('public setting registry flags', () => {
  it('exposes exactly the original public allowlist', () => {
    expect([...PUBLIC_BRANDING_KEYS].sort()).toEqual(
      [...ORIGINAL_PUBLIC_KEYS].sort(),
    );
  });
  it('never exposes sensitive settings', () => {
    for (const key of SETTING_KEYS) {
      const setting = SETTINGS_REGISTRY[key];
      if ('public' in setting && setting.public) {
        expect(setting.sensitive).toBe(false);
      }
    }
  });
});
