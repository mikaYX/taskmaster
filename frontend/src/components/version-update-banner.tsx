import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useVersionStatus } from '@/hooks/use-version-status';
import { useAuthStore } from '@/stores/auth-store';

const DISMISS_KEY = 'taskmaster-version-dismissed';

export function VersionUpdateBanner() {
  const { t } = useTranslation();
  const { data, backendUpgraded } = useVersionStatus();
  const role = useAuthStore((s) => s.role);
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem(DISMISS_KEY) === 'true',
  );

  const isPrivileged = role === 'SUPER_ADMIN' || role === 'MANAGER';

  if (!isPrivileged) return null;

  if (backendUpgraded) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md"
      >
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span>{t('version.reloadRequired')}</span>
        <button
          onClick={() => window.location.reload()}
          className="ml-1 rounded bg-white/20 px-3 py-0.5 text-xs font-semibold hover:bg-white/30 transition-colors"
        >
          {t('version.reload')}
        </button>
      </div>
    );
  }

  if (!data?.updateAvailable || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-md"
    >
      <ArrowUpCircle className="h-4 w-4 shrink-0" />
      <span>
        {t('version.updateAvailable', {
          latest: data.latestVersion,
          current: data.currentVersion,
        })}
      </span>
      {data.releaseUrl && (
        <a
          href={data.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 rounded bg-amber-950/10 px-3 py-0.5 text-xs font-semibold hover:bg-amber-950/20 transition-colors"
        >
          {t('version.viewRelease')}
        </a>
      )}
      <button
        onClick={handleDismiss}
        aria-label={t('version.dismiss')}
        className="ml-auto rounded p-0.5 hover:bg-amber-950/10 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
