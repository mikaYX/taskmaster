import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/constants";

export function TaskActionDialog({ isOpen, onClose, onConfirm, type, lang }) {
    const [comment, setComment] = useState("");

    // Reset comment when opening
    useEffect(() => {
        if (isOpen) setComment("");
    }, [isOpen]);

    const handleConfirm = () => {
        onConfirm(comment);
        onClose();
    };

    const isFail = type === 'fail';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>
                        {isFail ? t(lang, "failConfirmTitle") : t(lang, "validateConfirmTitle")}
                    </DialogTitle>
                    <DialogDescription className="hidden">Confirm Task Action</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <p className="text-sm text-slate-500">
                        {isFail ? t(lang, "failMessage") : t(lang, "validateMessage")}
                    </p>

                    {isFail && (
                        <div className="space-y-2">
                            <Label>{t(lang, "failCommentLabel")}</Label>
                            <Input
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder={t(lang, "textPlaceholder")}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t(lang, "cancel")}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        variant={isFail ? "destructive" : "default"}
                        className={!isFail && "bg-green-600 hover:bg-green-700"}
                    >
                        {t(lang, "confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
