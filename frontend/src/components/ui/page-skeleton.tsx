import { Skeleton } from '@/components/ui/skeleton';

/** Squelette générique : titre + zone de contenu */
export function PageSkeleton() {
    return (
        <div className="space-y-6 p-4" aria-busy="true" aria-label="Chargement…">
            <div className="space-y-2">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-80" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
        </div>
    );
}

/** Squelette tableau de bord — colonnes de cartes par bucket de date */
export function TaskBoardSkeleton() {
    return (
        <div className="space-y-4 p-4" aria-busy="true" aria-label="Chargement du tableau de bord…">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-40 rounded-md" />
                <Skeleton className="h-9 w-28 rounded-md" />
                <Skeleton className="h-9 w-28 rounded-md" />
                <div className="ml-auto flex gap-2">
                    <Skeleton className="h-9 w-44 rounded-md" />
                    <Skeleton className="h-9 w-36 rounded-md" />
                </div>
            </div>
            {/* Bucket columns */}
            <div className="space-y-4">
                {[1, 2, 3].map((col) => (
                    <div key={col} className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <div className="grid gap-2">
                            {Array.from({ length: col === 1 ? 4 : col === 2 ? 2 : 3 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                                    <Skeleton className="h-9 w-9 rounded-md shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-3 w-32" />
                                    </div>
                                    <Skeleton className="h-7 w-20 rounded-full" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Squelette page de gestion avec table */
export function TablePageSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-6 p-4" aria-busy="true" aria-label="Chargement…">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <Skeleton className="h-10 w-32 rounded-md" />
            </div>
            {/* Card avec toolbar + table */}
            <div className="rounded-lg border shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
                    <Skeleton className="h-9 w-64 rounded-md" />
                    <Skeleton className="h-9 w-36 rounded-md" />
                    <div className="ml-auto">
                        <Skeleton className="h-5 w-24" />
                    </div>
                </div>
                <div className="p-4 space-y-3">
                    {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                            <Skeleton className="h-6 w-16 rounded-full" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                            <Skeleton className="h-8 w-8 rounded-md" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Squelette page analytiques — stat cards + graphe + tableau */
export function AnalyticsSkeleton() {
    return (
        <div className="space-y-6 p-4" aria-busy="true" aria-label="Chargement des analytiques…">
            {/* Header */}
            <div className="space-y-1.5">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-64" />
            </div>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border p-4 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                ))}
            </div>
            {/* Chart area */}
            <div className="rounded-lg border p-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-48 w-full rounded-md" />
            </div>
            {/* Table */}
            <div className="rounded-lg border overflow-hidden">
                <div className="border-b bg-muted/30 px-4 py-3 flex gap-3">
                    <Skeleton className="h-8 w-28 rounded-md" />
                    <Skeleton className="h-8 w-28 rounded-md" />
                </div>
                <div className="p-4 space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <Skeleton className="h-4 flex-1 max-w-xs" />
                            <Skeleton className="h-4 w-16 ml-auto" />
                            <Skeleton className="h-4 w-12" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Squelette page paramètres — onglets + zone de contenu */
export function SettingsSkeleton() {
    return (
        <div className="space-y-6 p-4" aria-busy="true" aria-label="Chargement des paramètres…">
            <div className="space-y-1.5">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-64" />
            </div>
            {/* Tabs */}
            <div className="flex gap-2 border-b pb-0">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-24 rounded-t-md" />
                ))}
            </div>
            {/* Content */}
            <div className="rounded-lg border p-6 space-y-4">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
                <div className="space-y-3 pt-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-56" />
                            </div>
                            <Skeleton className="h-9 w-48 rounded-md" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Squelette page profil */
export function ProfileSkeleton() {
    return (
        <div className="space-y-6 p-4 max-w-2xl" aria-busy="true" aria-label="Chargement du profil…">
            <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-28" />
                </div>
            </div>
            <div className="rounded-lg border p-6 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-9 w-full rounded-md" />
                    </div>
                ))}
                <Skeleton className="h-10 w-28 rounded-md mt-2" />
            </div>
        </div>
    );
}
