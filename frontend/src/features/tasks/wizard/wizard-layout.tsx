import * as React from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface WizardLayoutProps {
    currentStep: number;
    steps: { title: string; description?: string }[];
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
    nextLabel = "Next"
}: WizardLayoutProps) {
    return (
        <div className="flex h-full min-h-[600px] gap-6">
            {/* Sidebar Stepper */}
            <aside className="w-64 flex-shrink-0 hidden md:block">
                <div className="sticky top-4 space-y-4">
                    <div className="px-4 py-2">
                        <h2 className="text-lg font-semibold tracking-tight">Create Task</h2>
                        <p className="text-sm text-muted-foreground">Follow the steps to configure your new task.</p>
                    </div>
                    <Separator />
                    <nav className="space-y-1">
                        {steps.map((step, index) => {
                            const isActive = currentStep === index;
                            const isCompleted = currentStep > index;

                            return (
                                <div
                                    key={step.title}
                                    className={cn(
                                        "group flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors",
                                        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                                        isCompleted ? "text-foreground" : ""
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] transition-colors",
                                            isActive ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground",
                                            isCompleted ? "border-primary bg-primary text-primary-foreground" : ""
                                        )}
                                    >
                                        {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
                                    </div>
                                    <div className="flex flex-col">
                                        <span>{step.title}</span>
                                        {isActive && step.description && (
                                            <span className="text-[10px] font-normal text-muted-foreground">
                                                {step.description}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </nav>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <Card className="flex-1 flex flex-col border-none shadow-none md:border md:shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle>{steps[currentStep].title}</CardTitle>
                        <CardDescription>{steps[currentStep].description || "Please fill in the details below."}</CardDescription>
                    </CardHeader>
                    <Separator />
                    <CardContent className="flex-1 py-6">
                        {children}
                    </CardContent>
                    <Separator />
                    <CardFooter className="py-4 justify-between bg-muted/20">
                        <Button variant="ghost" onClick={onBack} disabled={currentStep === 0}>
                            Back
                        </Button>
                        <Button onClick={onNext} disabled={!canNext || isSubmitting}>
                            {isSubmitting ? "Processing..." : (currentStep === steps.length - 1 ? "Create Task" : nextLabel)}
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </div>
    )
}
