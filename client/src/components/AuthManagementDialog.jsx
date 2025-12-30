import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield } from 'lucide-react';
import { t } from "@/lib/constants";
import { AuthSettingsTab } from "./settings/AuthSettingsTab";

export function AuthManagementDialog({
    isOpen,
    onClose,
    lang,
    authAzureEnabled,
    setAuthAzureEnabled,
    authAzureTenant,
    setAuthAzureTenant,
    authAzureClientId,
    setAuthAzureClientId,
    authAzureClientSecret,
    setAuthAzureClientSecret,
    authLdapEnabled,
    setAuthLdapEnabled,
    authLdapUrl,
    setAuthLdapUrl,
    authLdapBindDn,
    setAuthLdapBindDn,
    authLdapBindPassword,
    setAuthLdapBindPassword,
    authLdapSearchBase,
    setAuthLdapSearchBase,
    authLdapFilter,
    setAuthLdapFilter
}) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {t(lang, "authTab") || "Authentication"}
                    </DialogTitle>
                    <DialogDescription className="hidden">Configure External Authentication Providers</DialogDescription>
                </DialogHeader>

                <div className="py-4 max-h-[500px] overflow-y-auto">
                    <AuthSettingsTab
                        lang={lang}
                        authAzureEnabled={authAzureEnabled}
                        setAuthAzureEnabled={setAuthAzureEnabled}
                        authAzureTenant={authAzureTenant}
                        setAuthAzureTenant={setAuthAzureTenant}
                        authAzureClientId={authAzureClientId}
                        setAuthAzureClientId={setAuthAzureClientId}
                        authAzureClientSecret={authAzureClientSecret}
                        setAuthAzureClientSecret={setAuthAzureClientSecret}
                        authLdapEnabled={authLdapEnabled}
                        setAuthLdapEnabled={setAuthLdapEnabled}
                        authLdapUrl={authLdapUrl}
                        setAuthLdapUrl={setAuthLdapUrl}
                        authLdapBindDn={authLdapBindDn}
                        setAuthLdapBindDn={setAuthLdapBindDn}
                        authLdapBindPassword={authLdapBindPassword}
                        setAuthLdapBindPassword={setAuthLdapBindPassword}
                        authLdapSearchBase={authLdapSearchBase}
                        setAuthLdapSearchBase={setAuthLdapSearchBase}
                        authLdapFilter={authLdapFilter}
                        setAuthLdapFilter={setAuthLdapFilter}
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t(lang, "close") || "Close"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
