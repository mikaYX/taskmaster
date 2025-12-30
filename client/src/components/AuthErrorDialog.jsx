import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export function AuthErrorDialog({ isOpen, onClose, message }) {
    if (!message) return null;

    // Clean up message if it contains "Authentication failed: " prefix to make it cleaner? 
    // Or keep it as is.

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px] border-l-4 border-l-red-500">
                <DialogHeader className="flex flex-row items-center gap-4">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                        <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="space-y-1">
                        <DialogTitle className="text-xl text-red-600 dark:text-red-400">Connection Failed</DialogTitle>
                        <DialogDescription className="hidden">Authentication Error Details</DialogDescription>
                    </div>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-slate-700 dark:text-slate-200 font-medium mb-2">
                        Authorization Error
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-100 dark:border-slate-800 font-mono break-words">
                        {message}
                    </p>
                </div>
                <DialogFooter>
                    <Button onClick={onClose} variant="default" className="w-full">
                        Back to Home
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
