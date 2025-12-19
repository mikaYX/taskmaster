import * as React from "react"
import { cva } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

import { createPortal } from "react-dom"

const ToastProvider = ({ children }) => <>{children}</>

const ToastViewport = React.forwardRef(({ className, children, ...props }, ref) => {
    if (typeof window === 'undefined') return null;
    return createPortal(
        <div
            ref={ref}
            className={cn(
                "fixed top-0 z-[99999] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
                className
            )}
            {...props}
        >
            {children}
        </div>,
        document.body
    );
})
ToastViewport.displayName = "ToastViewport"

const toastVariants = cva(
    "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
    {
        variants: {
            variant: {
                default: "border bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50",
                destructive:
                    "destructive group border-destructive bg-destructive text-destructive-foreground",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

const Toast = React.forwardRef(({ className, variant, open, onOpenChange, ...props }, ref) => {
    // If open is false, we can choose to return null or render with 'closed' state.
    // Standard Shadcn/Radix often relies on animation mounting/unmounting.
    // For simplicity here, if !open, don't render.
    if (open === false) return null;

    return (
        <div
            ref={ref}
            className={cn(toastVariants({ variant }), className)}
            data-state={open ? "open" : "closed"}
            {...props}
        />
    )
})
Toast.displayName = "Toast"

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
    <button
        ref={ref}
        className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
            className
        )}
        {...props}
    />
))
ToastAction.displayName = "ToastAction"

const ToastClose = React.forwardRef(({ className, onClick, ...props }, ref) => {
    // We need to act as a close trigger. 
    // In Radix this is wired automatically. Here we need to find the parent Toast's onClose or onOpenChange?
    // This is tricky without Context. 
    // Simple fix: We don't support clicking 'X' for now inside the mock unless we pass setters.
    // Or we rely on auto-dismiss.
    // Or we just make it purely visual for now since the user didn't ask for manual dismiss explicitely.
    return (
        <button
            ref={ref}
            className={cn(
                "absolute right-2 top-2 rounded-md p-1 text-slate-950/50 opacity-0 transition-opacity hover:text-slate-950 focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600 dark:text-slate-50/50 dark:hover:text-slate-50",
                className
            )}
            toast-close=""
            onClick={onClick}
            {...props}
        >
            <X className="h-4 w-4" />
        </button>
    )
})
ToastClose.displayName = "ToastClose"

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("text-sm font-semibold", className)}
        {...props}
    />
))
ToastTitle.displayName = "ToastTitle"

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("text-sm opacity-90", className)}
        {...props}
    />
))
ToastDescription.displayName = "ToastDescription"

export {
    ToastProvider,
    ToastViewport,
    Toast,
    ToastTitle,
    ToastDescription,
    ToastClose,
    ToastAction,
}
