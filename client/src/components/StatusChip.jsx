import React from 'react';
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle2, XCircle, AlertCircle, Calendar } from 'lucide-react';

const statusConfig = {
    pending: {
        icon: Clock,
        className: "bg-gradient-to-r from-amber-100 to-amber-50 text-amber-800 border-amber-300 hover:from-amber-200 hover:to-amber-100 dark:bg-none dark:bg-amber-600 dark:text-white dark:border-amber-700 shadow-amber-100/50",
        animate: true
    },
    validated: {
        icon: CheckCircle2,
        className: "bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-800 border-emerald-300 hover:from-emerald-200 hover:to-emerald-100 dark:bg-none dark:bg-emerald-600 dark:text-white dark:border-emerald-700 shadow-emerald-100/50"
    },
    failed: {
        icon: XCircle,
        className: "bg-gradient-to-r from-rose-100 to-rose-50 text-rose-800 border-rose-300 hover:from-rose-200 hover:to-rose-100 dark:bg-none dark:bg-red-500 dark:text-white dark:border-red-600 shadow-rose-100/50"
    },
    missing: {
        icon: AlertCircle,
        className: "bg-gradient-to-r from-slate-200 to-slate-100 text-slate-700 border-slate-300 hover:from-slate-300 hover:to-slate-200 dark:bg-none dark:bg-slate-600 dark:text-white dark:border-slate-500 shadow-slate-100/50"
    },
    ferie: {
        icon: Calendar,
        className: "bg-gradient-to-r from-sky-100 to-sky-50 text-sky-800 border-sky-300 hover:from-sky-200 hover:to-sky-100 dark:bg-none dark:bg-sky-600 dark:text-white dark:border-sky-700 shadow-sky-100/50"
    }
};

export function StatusChip({ status, lang = "EN", className }) {
    const config = statusConfig[status] || {
        icon: AlertCircle,
        className: "bg-slate-100 text-slate-800 border-slate-300"
    };

    const Icon = config.icon;

    return (
        <Badge
            className={cn(
                "font-semibold text-sm px-1 py-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 w-32 justify-center",
                config.className,
                config.animate && "animate-pulse-soft",
                className
            )}
            variant="outline"
        >
            <Icon className="w-4 h-4 mr-1.5" />
            {t(lang, status)}
        </Badge>
    );
}
