import { useFormContext } from "react-hook-form";
import type { CreateTaskFormValues } from "../../schemas/task-creation.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarDays, CalendarRange, Clock, Repeat, Users } from "lucide-react";


const PRIORITIES = [
    { value: 'LOW', label: 'Low', color: 'text-blue-400' },
    { value: 'MEDIUM', label: 'Medium', color: 'text-emerald-400' },
    { value: 'HIGH', label: 'High', color: 'text-orange-400' },
    { value: 'CRITICAL', label: 'Critical', color: 'text-rose-400' },
] as const;

const PERIODICITIES = [
    { id: 'daily', label: 'Daily', icon: Clock, desc: 'Every day' },
    { id: 'weekly', label: 'Weekly', icon: Repeat, desc: 'Every week' },
    { id: 'monthly', label: 'Monthly', icon: CalendarDays, desc: 'Every month' },
    { id: 'yearly', label: 'Yearly', icon: CalendarRange, desc: 'Every year' },
    { id: 'custom', label: 'Custom', icon: Users, desc: 'Advanced Rules' },
] as const;

export function StepDefinition() {
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
                                <FormLabel>Task Name</FormLabel>
                            </div>
                            <FormControl>
                                <Input placeholder="e.g. Server Backup" {...field} />
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
                                <FormLabel>Priority</FormLabel>
                            </div>
                            <Select value={field.value ?? 'MEDIUM'} onValueChange={field.onChange}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Priority" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {PRIORITIES.map((p) => (
                                        <SelectItem key={p.value} value={p.value}>
                                            <span className={p.color}>{p.label}</span>
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
                        <FormLabel className="shrink-0 h-7 flex items-center">Procedure (Optional)</FormLabel>
                        <TabsList className="grid w-[160px] grid-cols-2 h-8 p-0.5 shrink-0">
                            <TabsTrigger value="URL" className="text-[11px] h-full py-0">Lien Web</TabsTrigger>
                            <TabsTrigger value="UPLOAD" className="text-[11px] h-full py-0">Fichier</TabsTrigger>
                        </TabsList>
                        <div className="flex-1 min-w-[200px] flex items-center">
                            <TabsContent value="URL" className="mt-0 flex-1 data-[state=inactive]:hidden">
                                <FormField
                                    control={control}
                                    name="procedureUrl"
                                    render={({ field }) => (
                                        <FormItem className="space-y-0">
                                            <FormControl>
                                                <Input placeholder="https://wiki..." className="h-8" {...field} value={field.value || ''} />
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
                                            {value && value instanceof File && <p className="text-[11px] text-muted-foreground mt-1.5">Sélectionné: {value.name}</p>}
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
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                            <Textarea
                                placeholder="Describe what needs to be done..."
                                className="resize-none h-24"
                                {...field}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <div className="space-y-2">
                <FormLabel>Periodicity</FormLabel>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {PERIODICITIES.map((p) => {
                        const Icon = p.icon;
                        const isSelected = selectedPeriodicity === p.id;
                        return (
                            <Card
                                key={p.id}
                                className={cn(
                                    "cursor-pointer transition-all hover:bg-accent hover:text-accent-foreground",
                                    isSelected ? "border-primary bg-primary/5 shadow-md" : "border-muted"
                                )}
                                onClick={() => setValue("periodicity", p.id as CreateTaskFormValues['periodicity'], { shouldValidate: true })}
                            >
                                <CardContent className="flex flex-col items-center justify-center p-4 text-center h-full">
                                    <Icon className={cn("h-6 w-6 mb-2", isSelected ? "text-primary" : "text-muted-foreground")} />
                                    <span className={cn("font-medium text-sm", isSelected ? "text-primary" : "")}>{p.label}</span>
                                    <span className="text-[10px] text-muted-foreground mt-1">{p.desc}</span>
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
            </div>
        </div >
    );
}
