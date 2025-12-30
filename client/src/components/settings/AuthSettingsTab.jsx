import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/constants";

export function AuthSettingsTab({
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
        <div className="space-y-6">
            {/* Azure AD */}
            <div className="space-y-4 border rounded-md p-4 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base">{t(lang, "authAzureTitle")}</h3>
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Recommended</Badge>
                    </div>
                    <Switch checked={authAzureEnabled} onCheckedChange={setAuthAzureEnabled} />
                </div>

                {authAzureEnabled && (
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <Label htmlFor="azure-tenant">{t(lang, "authAzureTenant")}</Label>
                            <Input id="azure-tenant" value={authAzureTenant} onChange={e => setAuthAzureTenant(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="azure-client-id">{t(lang, "authAzureClientId")}</Label>
                                <Input id="azure-client-id" value={authAzureClientId} onChange={e => setAuthAzureClientId(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="azure-client-secret">{t(lang, "authAzureClientSecret")}</Label>
                                <Input id="azure-client-secret" type="password" value={authAzureClientSecret} onChange={e => setAuthAzureClientSecret(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* LDAP */}
            <div className="space-y-4 border rounded-md p-4 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-base">{t(lang, "authLdapTitle")}</h3>
                    <Switch checked={authLdapEnabled} onCheckedChange={setAuthLdapEnabled} />
                </div>

                {authLdapEnabled && (
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <Label htmlFor="ldap-url">{t(lang, "authLdapUrl")}</Label>
                            <Input id="ldap-url" value={authLdapUrl} onChange={e => setAuthLdapUrl(e.target.value)} placeholder="ldap://domain.com:389" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="ldap-bind-dn">{t(lang, "authLdapBindDn")}</Label>
                                <Input id="ldap-bind-dn" value={authLdapBindDn} onChange={e => setAuthLdapBindDn(e.target.value)} placeholder="CN=Service,OU=Users,DC=example,DC=com" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ldap-bind-password">{t(lang, "authLdapBindPassword")}</Label>
                                <Input id="ldap-bind-password" type="password" value={authLdapBindPassword} onChange={e => setAuthLdapBindPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ldap-search-base">{t(lang, "authLdapSearchBase")}</Label>
                            <Input id="ldap-search-base" value={authLdapSearchBase} onChange={e => setAuthLdapSearchBase(e.target.value)} placeholder="OU=Users,DC=example,DC=com" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ldap-filter">{t(lang, "authLdapFilter")}</Label>
                            <Input id="ldap-filter" value={authLdapFilter} onChange={e => setAuthLdapFilter(e.target.value)} placeholder="(sAMAccountName={{username}})" />
                            <p className="text-xs text-muted-foreground">Use <code>{'{{username}}'}</code> as placeholder</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
