import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export type ErrorFallbackVariant = 'page' | 'section';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  variant?: ErrorFallbackVariant;
  /** Nom du contexte affiché à l'utilisateur (ex: "Tableau de bord") */
  context?: string;
}

/**
 * Fallback affiché par ErrorBoundary en cas d'erreur React non rattrapée.
 *
 * - variant="page"    → plein écran, avec bouton retour accueil (boundary global)
 * - variant="section" → carte inline, sans redirection (boundary par feature)
 */
export function ErrorFallback({
  error,
  resetError,
  variant = 'page',
  context,
}: ErrorFallbackProps) {
  const { t } = useTranslation();

  const isPage = variant === 'page';

  const title = isPage
    ? t('errorBoundary.pageTitle')
    : t('errorBoundary.sectionTitle');

  const description = isPage
    ? t('errorBoundary.pageDescription')
    : t('errorBoundary.sectionDescription');

  if (isPage) {
    return <PageFallback title={title} description={description} error={error} resetError={resetError} context={context} />;
  }

  return <SectionFallback title={title} description={description} error={error} resetError={resetError} context={context} />;
}

/* ─── Page variant (plein écran) ─────────────────────────────────────────── */

function PageFallback({
  title,
  description,
  error,
  resetError,
  context,
}: {
  title: string;
  description: string;
  error: Error;
  resetError: () => void;
  context?: string;
}) {
  const { t } = useTranslation();

  // useNavigate peut ne pas être disponible si le boundary est au-dessus du Router
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate();
  } catch {
    // Boundary global au-dessus du Router → pas de navigate disponible
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-muted">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-destructive/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
          {context && (
            <p className="text-xs text-muted-foreground">
              {t('errorBoundary.context', { context })}
            </p>
          )}
        </CardHeader>

        <CardContent>
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground select-none mb-2">
              {t('errorBoundary.errorDetails')}
            </summary>
            <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground font-mono text-left overflow-auto max-h-32">
              {error.message}
            </div>
          </details>
        </CardContent>

        <CardFooter className="flex justify-center gap-2 flex-wrap">
          <Button onClick={resetError} variant="outline" className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            {t('errorBoundary.retry')}
          </Button>
          {navigate && (
            <Button
              onClick={() => { resetError(); navigate!('/'); }}
              variant="default"
              className="gap-2"
            >
              <Home className="w-4 h-4" />
              {t('errorBoundary.goHome')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

/* ─── Section variant (inline, par feature) ──────────────────────────────── */

function SectionFallback({
  title,
  description,
  error,
  resetError,
  context,
}: {
  title: string;
  description: string;
  error: Error;
  resetError: () => void;
  context?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="w-full flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-2 space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
          <CardDescription className="text-sm">
            {context
              ? t('errorBoundary.context', { context })
              : description}
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-2">
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground select-none mb-1">
              {t('errorBoundary.errorDetails')}
            </summary>
            <p className="text-xs font-mono text-muted-foreground bg-muted rounded p-2 overflow-auto max-h-20 break-all">
              {error.message}
            </p>
          </details>
        </CardContent>

        <CardFooter className="pt-0">
          <Button onClick={resetError} variant="outline" size="sm" className="gap-1.5">
            <RefreshCcw className="w-3.5 h-3.5" />
            {t('errorBoundary.retry')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
