
import { Info, RefreshCcw, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SystemUnavailablePageProps {
    onRetry: () => void;
    isRetrying?: boolean;
}

export function SystemUnavailablePage({ onRetry, isRetrying = false }: SystemUnavailablePageProps) {
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md shadow-lg border-muted">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto bg-muted p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                        <ServerCrash className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">
                        Système Indisponible
                    </CardTitle>
                    <CardDescription className="text-base">
                        La connexion avec le serveur a échoué.
                    </CardDescription>
                </CardHeader>

                <CardContent className="text-center space-y-4">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 text-blue-900/80 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-200/80 space-y-3 text-sm">
                        <p>Cela peut être dû à une maintenance en cours ou à un problème de réseau.</p>
                        <p>Veuillez vérifier votre connexion internet.</p>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center gap-1.5 cursor-help transition-colors hover:text-blue-700 dark:hover:text-blue-300 mx-auto w-fit">
                                        <p>Le serveur est peut-être encore en cours de lancement.</p>
                                        <Info className="w-4 h-4 text-blue-500" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Le premier démarrage peut prendre jusqu'à 1 minute.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </CardContent>

                <CardFooter className="flex justify-center pt-2">
                    <Button
                        onClick={onRetry}
                        disabled={isRetrying}
                        className="w-full sm:w-auto min-w-[140px]"
                    >
                        {isRetrying ? (
                            <>
                                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                                Connexion...
                            </>
                        ) : (
                            <>
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Réessayer
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
