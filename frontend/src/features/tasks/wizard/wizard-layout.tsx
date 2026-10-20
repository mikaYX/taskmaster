import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Sparkles, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

interface WizardLayoutProps {
    currentStep: number;
    steps: { title: string; description?: string; icon?: LucideIcon }[];
    children: React.ReactNode;
    onNext: () => void;
    onBack: () => void;
    canNext: boolean;
    isSubmitting?: boolean;
    nextLabel?: string;
}

export function WizardLayout({
    currentStep,
    steps,
    children,
    onNext,
    onBack,
    canNext,
    isSubmitting = false,
    nextLabel
}: WizardLayoutProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const isLast = currentStep === steps.length - 1;
    const progress = ((currentStep + 1) / steps.length) * 100;
    const step = steps[currentStep];
    const StepIcon = step.icon;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{t('taskWizard.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('taskWizard.subtitle')}</p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => navigate('/task-definitions')}>
                    <ArrowLeft className="h-4 w-4" />
                    {t('taskWizard.backToList')}
                </Button>
            </div>

            {/* Progress (always visible, the only stepper on small screens) */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground md:hidden">{step.title}</span>
                    <span className="hidden md:inline">{t('taskWizard.stepOf', { current: currentStep + 1, total: steps.length })}</span>
                    <span className="tabular-nums md:hidden">{currentStep + 1}/{steps.length}</span>
                    <span className="hidden tabular-nums md:inline">{Math.round(progress)} %</span>
                </div>
                <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={steps.length}
                    aria-valuenow={currentStep + 1}
                    aria-label={t('taskWizard.stepOf', { current: currentStep + 1, total: steps.length })}
                >
                    <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                </div>
            </div>

            <div className="flex gap-6">
                {/* Vertical stepper */}
                <aside className="hidden w-64 shrink-0 md:block">
                    <nav aria-label={t('taskWizard.title')} className="sticky top-4 rounded-xl border bg-card p-3 shadow-sm">
                        <ol className="relative space-y-1">
                            {steps.map((s, index) => {
                                const isActive = currentStep === index;
                                const isCompleted = currentStep > index;
                                const Icon = s.icon;

                                return (
                                    <li key={s.title} className="relative">
                                        {index < steps.length - 1 && (
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "absolute -bottom-[0.875rem] left-[1.625rem] top-[2.625rem] w-px",
                                                    isCompleted ? "bg-primary" : "bg-border"
                                                )}
                                            />
                                        )}
                                        <div
                                            aria-current={isActive ? "step" : undefined}
                                            className={cn(
                                                "flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
                                                isActive && "bg-primary/5"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all",
                                                    isCompleted && "border-primary bg-primary text-primary-foreground",
                                                    isActive && "border-primary bg-background text-primary ring-4 ring-primary/15",
                                                    !isActive && !isCompleted && "border-border bg-background text-muted-foreground"
                                                )}
                                            >
                                                {isCompleted ? <Check className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4" /> : index + 1}
                                            </span>
                                            <span className="min-w-0 pt-1">
                                                <span
                                                    className={cn(
                                                        "block text-sm font-medium leading-tight",
                                                        isActive ? "text-foreground" : isCompleted ? "text-foreground/80" : "text-muted-foreground"
                                                    )}
                                                >
                                                    {s.title}
                                                </span>
                                                {s.description && (
                                                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                                        {s.description}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>
                    </nav>
                </aside>

                {/* Step content */}
                <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center gap-3 border-b px-6 py-5">
                        {StepIcon && (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <StepIcon className="h-5 w-5" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold leading-tight">{step.title}</h2>
                            <p className="text-sm text-muted-foreground">{step.description || t('taskWizard.fillDetails')}</p>
                        </div>
                    </div>
                    <div className="flex-1 px-6 py-6">
                        {children}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4">
                        <Button variant="outline" onClick={onBack} disabled={currentStep === 0} className="gap-1.5">
                            <ChevronLeft className="h-4 w-4" />
                            {t('common.back')}
                        </Button>
                        <Button onClick={onNext} disabled={!canNext || isSubmitting} className="min-w-36 gap-1.5 shadow-sm">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('taskWizard.processing')}
                                </>
                            ) : isLast ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('taskWizard.createButton')}
                                </>
                            ) : (
                                <>
                                    {nextLabel ?? t('common.next')}
                                    <ChevronRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </main>
            </div>
        </div>
    )
}
