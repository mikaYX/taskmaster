import { ChecklistEditor } from '../../components/checklist-editor';
import { useFormContext } from "react-hook-form";
import type { CreateTaskFormValues } from "../../schemas/task-creation.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarDays, CalendarRange, Check, Clock, Repeat, Users } from "lucide-react";
import { useTranslation } from "react-i18next";


const PRIORITIES = [
    { value: 'LOW', color: 'text-blue-400' },
    { value: 'MEDIUM', color: 'text-emerald-400' },
    { value: 'HIGH', color: 'text-orange-400' },
    { value: 'CRITICAL', color: 'text-rose-400' },
] as const;

const PERIODICITIES = [
    { id: 'daily', icon: Clock },
    { id: 'weekly', icon: Repeat },
    { id: 'monthly', icon: CalendarDays },
    { id: 'yearly', icon: CalendarRange },
    { id: 'custom', icon: Users },
] as const;

export function StepDefinition() {
    const { t } = useTranslation();
    const { control, watch, setValue } = useFormContext<CreateTaskFormValues>();
    const selectedPeriodicity = watch("periodicity");

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-4">
                <FormField
                    control={control}
                    name="name"
                    render={({ field }) => (
                        <FormItem className="space-y-0">
                            <div className="flex h-7 items-center mb-2">
                                <FormLabel>{t('taskWizard.definition.name')}</FormLabel>
                            </div>
                            <FormControl>
                                <Input placeholder={t('taskWizard.definition.namePlaceholder')} {...field} />
                            </FormControl>
                            <FormMessage className="mt-2" />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="priority"
                    render={({ field }) => (
                        <FormItem className="space-y-0">
                            <div className="flex h-7 items-center mb-2">
                                <FormLabel>{t('taskWizard.definition.priority')}</FormLabel>
                            </div>
                            <Select value={field.value ?? 'MEDIUM'} onValueChange={field.onChange}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('taskWizard.definition.priority')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {PRIORITIES.map((p) => (
                                        <SelectItem key={p.value} value={p.value}>
                                            <span className={p.color}>{t(`taskWizard.priorities.${p.value}`)}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage className="mt-2" />
                        </FormItem>
                    )}
                />
            </div>
            <div className="space-y-1">
                <Tabs defaultValue="URL" value={watch('procedureMode')} onValueChange={(v) => setValue('procedureMode', v as 'URL' | 'UPLOAD')} className="space-y-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <FormLabel className="shrink-0 h-7 flex items-center">{t('taskWizard.definition.procedure')}</FormLabel>
                        <TabsList className="grid w-[160px] grid-cols-2 h-8 p-0.5 shrink-0">
                            <TabsTrigger value="URL" className="text-[11px] h-full py-0">{t('taskWizard.definition.procedureLink')}</TabsTrigger>
                            <TabsTrigger value="UPLOAD" className="text-[11px] h-full py-0">{t('taskWizard.definition.procedureFile')}</TabsTrigger>
                        </TabsList>
                        <div className="flex-1 min-w-[200px] flex items-center">
                            <TabsContent value="URL" className="mt-0 flex-1 data-[state=inactive]:hidden">
                                <FormField
                                    control={control}
                                    name="procedureUrl"
                                    render={({ field }) => (
                                        <FormItem className="space-y-0">
                                            <FormControl>
                                                <Input placeholder={t('taskWizard.definition.procedureUrlPlaceholder')} className="h-8" {...field} value={field.value || ''} />
                                            </FormControl>
                                            <FormMessage className="mt-2" />
                                        </FormItem>
                                    )}
                                />
                            </TabsContent>
                            <TabsContent value="UPLOAD" className="mt-0 flex-1 data-[state=inactive]:hidden">
                                <FormField
                                    control={control}
                                    name="procedureFile"
                                    render={({ field: { value, onChange, ...fieldProps } }) => (
                                        <FormItem className="space-y-0">
                                            <FormControl>
                                                <Input
                                                    type="file"
                                                    accept=".pdf,.doc,.docx"
                                                    className="h-8 cursor-pointer file:cursor-pointer"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        onChange(file);
                                                    }}
                                                    {...fieldProps}
                                                />
                                            </FormControl>
                                            {value && value instanceof File && <p className="text-[11px] text-muted-foreground mt-1.5">{t('taskWizard.definition.selectedFile', { name: value.name })}</p>}
                                            <FormMessage className="mt-2" />
                                        </FormItem>
                                    )}
                                />
                            </TabsContent>
                        </div>
                    </div>
                </Tabs>
            </div>

            <FormField
                control={control}
                name="description"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t('taskWizard.definition.description')}</FormLabel>
                        <FormControl>
                            <Textarea
                                placeholder={t('taskWizard.definition.descriptionPlaceholder')}
                                className="resize-none h-24"
                                {...field}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <div className="space-y-2">
                <FormLabel>{t('taskWizard.definition.periodicity')}</FormLabel>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {PERIODICITIES.map((p) => {
                        const Icon = p.icon;
                        const isSelected = selectedPeriodicity === p.id;
                        return (
                            <Card
                                key={p.id}
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={0}
                                className={cn(
                                    "relative cursor-pointer gap-0 py-0 outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                                    isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:border-primary/30"
                                )}
                                onClick={() => setValue("periodicity", p.id as CreateTaskFormValues['periodicity'], { shouldValidate: true })}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setValue("periodicity", p.id as CreateTaskFormValues['periodicity'], { shouldValidate: true });
                                    }
                                }}
                            >
                                {isSelected && (
                                    <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                        <Check className="h-3 w-3" />
                                    </span>
                                )}
                                <CardContent className="flex flex-col items-center justify-center p-4 text-center h-full">
                                    <span className={cn("mb-2 flex h-10 w-10 items-center justify-center rounded-xl", isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <span className={cn("font-medium text-sm", isSelected ? "text-primary" : "")}>{t(`taskWizard.periodicities.${p.id}.label`)}</span>
                                    <span className="text-[10px] text-muted-foreground mt-1">{t(`taskWizard.periodicities.${p.id}.desc`)}</span>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
                {/* Manual Error Message for Periodicity since it's not a standard input */}
                <FormField
                    control={control}
                    name="periodicity"
                    render={({ fieldState }) => (
                        fieldState.error ? <p className="text-sm font-medium text-destructive">{fieldState.error.message}</p> : <></>
                    )}
                />
                <ChecklistEditor value={watch("executionChecklist") ?? []} onChange={value => setValue("executionChecklist", value, { shouldDirty: true, shouldValidate: true })} />
        </div>
        </div >
    );
}
