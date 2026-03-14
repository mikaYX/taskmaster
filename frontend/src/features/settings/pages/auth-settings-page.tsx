import { useEffect, useRef, useState } from 'react';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSettings } from '../hooks/use-settings';
import { settingsApi } from '@/api/settings';
import { authSettingsSchema } from '../schemas/settings-schemas';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Key, Minus, Plus, Shield, Smartphone, Clock, Info, CheckCircle2, User, Laptop, Mail, Settings, Lock, ShieldCheck, UserCog, AlertTriangle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function AuthSettingsPage() {

    const { settings, getSetting, updateSettings, isLoading, isUpdating, emailConfigStatus } = useSettings();
    const isInitialized = useRef(false);
    const [providerTab, setProviderTab] = useState('azure');
    const [activeTab, setActiveTab] = useState('auth');
    const [validatingProvider, setValidatingProvider] = useState<string | null>(null);
    const [capabilities, setCapabilities] = useState<Record<string, { implemented: boolean; configured: boolean; enabled: boolean; effectiveEnabled: boolean }> | null>(null);
    const [isLoadingCaps, setIsLoadingCaps] = useState(true);
    const [capabilitiesError, setCapabilitiesError] = useState(false);

    const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'testing' | 'success' | 'error' | 'timeout'; message?: string }>>({
        azure: { status: 'idle' },
        google: { status: 'idle' },
        oidc: { status: 'idle' },
        saml: { status: 'idle' },
        ldap: { status: 'idle' },
    });

    const refreshCapabilities = () => {
        settingsApi.getAuthCapabilities()
            .then(data => {
                setCapabilities(data);
                setCapabilitiesError(false);
            })
            .catch(err => {
                console.error("Failed to fetch auth capabilities", err);
                setCapabilitiesError(true);
            })
            .finally(() => setIsLoadingCaps(false));
    };

    useEffect(() => {
        refreshCapabilities();
    }, []);

    const isProviderDisabled = (key: string) => {
        if (capabilitiesError) return true;
        if (!capabilities) return true;
        return !capabilities[key]?.implemented;
    };

    const ProviderBadge = ({ capabilityKey, providerType }: { capabilityKey: string, providerType: string }) => {
        if (!capabilities || !capabilities[capabilityKey]) return null;
        const cap = capabilities[capabilityKey];
        const result = testResults[providerType];

        // Check current form state for enabled status
        let isCurrentlyEnabled = false;
        if (providerType === 'azure') {
            isCurrentlyEnabled = form.watch('azureAd.enabled');
        } else if (providerType === 'google') {
            isCurrentlyEnabled = form.watch('google.enabled');
        } else if (providerType === 'oidc' || providerType === 'saml') {
            isCurrentlyEnabled = form.watch('generic.enabled');
        } else if (providerType === 'ldap') {
            isCurrentlyEnabled = form.watch('ldap.enabled');
        }

        if (result?.status === 'error' || result?.status === 'timeout') {
            return <Badge variant="destructive" className="ml-2">Test Failed</Badge>;
        }
        // Show "Active" only if enabled in form AND configured
        if (isCurrentlyEnabled && cap.configured) {
            return <Badge className="ml-2 bg-green-500 hover:bg-green-600">Active</Badge>;
        }
        if (cap.configured) {
            return <Badge className="ml-2 bg-blue-500 hover:bg-blue-600">Configured</Badge>;
        }
        return <Badge variant="secondary" className="ml-2">Available</Badge>;
    };

    const form = useForm({
        resolver: zodResolver(authSettingsSchema),
        defaultValues: {
            mfa: {
                required: false,
                methods: ['authenticator'],
            },
            passkeys: {
                enabled: false,
            },
            requirements: {
                admin: {
                    mfa: false,
                    passkeys: false,
                },
                user: {
                    mfa: false,
                    passkeys: false,
                },
            },
            session: {
                timeout: 30,
                secureActions: true,
            },
            azureAd: {
                enabled: false,
                tenantId: '',
                clientId: '',
                clientSecret: '',
            },
            google: {
                enabled: false,
                clientId: '',
                clientSecret: '',
                hostedDomain: '',
            },
            generic: {
                enabled: false,
                type: 'oidc' as 'oidc' | 'saml',
                oidc: {
                    issuer: '',
                    clientId: '',
                    clientSecret: '',
                    scopes: 'openid profile email',
                },
                saml: {
                    entityId: '',
                    ssoUrl: '',
                    x509: '',
                    metadataUrl: '',
                },
            },
            ldap: {
                enabled: false,
                url: '',
                bindDn: '',
                bindPassword: '',
                searchBase: '',
                searchFilter: '(mail={{usermail}})',
            },
        },
    });

    // Reset status when form changes
    useEffect(() => {
        const subscription = form.watch((_value, { name }) => {
            if (name?.startsWith('azureAd')) setTestResults(prev => ({ ...prev, azure: { status: 'idle' } }));
            if (name?.startsWith('google')) setTestResults(prev => ({ ...prev, google: { status: 'idle' } }));
            if (name?.startsWith('generic')) setTestResults(prev => ({ ...prev, oidc: { status: 'idle' }, saml: { status: 'idle' } }));
            if (name?.startsWith('ldap')) setTestResults(prev => ({ ...prev, ldap: { status: 'idle' } }));
        });
        return () => subscription.unsubscribe();
    }, [form, form.watch]);

    // Load settings into form
    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            isInitialized.current = true;
            form.reset({
                mfa: {
                    required: getSetting('auth.mfa.required') === 'true',
                    methods: (getSetting('auth.mfa.methods') || 'authenticator').split(',').filter(Boolean),
                },
                passkeys: {
                    enabled: getSetting('auth.passkeys.enabled') === 'true',
                },
                requirements: {
                    admin: {
                        mfa: getSetting('auth.requirements.admin.mfa') === 'true',
                        passkeys: getSetting('auth.requirements.admin.passkeys') === 'true',
                    },
                    user: {
                        mfa: getSetting('auth.requirements.user.mfa') === 'true',
                        passkeys: getSetting('auth.requirements.user.passkeys') === 'true',
                    },
                },
                session: {
                    timeout: parseInt(getSetting('auth.session.timeout') || '30'),
                    secureActions: getSetting('auth.session.secureActions') === 'true',
                },
                azureAd: {
                    enabled: getSetting('auth.azureAd.enabled') === 'true',
                    tenantId: getSetting('auth.azureAd.tenantId') || '',
                    clientId: getSetting('auth.azureAd.clientId') || '',
                    clientSecret: getSetting('auth.azureAd.clientSecret') || '',
                },
                google: {
                    enabled: getSetting('auth.google.enabled') === 'true',
                    clientId: getSetting('auth.google.clientId') || '',
                    clientSecret: getSetting('auth.google.clientSecret') || '',
                    hostedDomain: getSetting('auth.google.hostedDomain') || '',
                },
                generic: {
                    enabled: getSetting('auth.generic.enabled') === 'true',
                    type: (getSetting('auth.generic.type') as 'oidc' | 'saml') || 'oidc',
                    oidc: {
                        issuer: getSetting('auth.generic.oidc.issuer') || '',
                        clientId: getSetting('auth.generic.oidc.clientId') || '',
                        clientSecret: getSetting('auth.generic.oidc.clientSecret') || '',
                        scopes: getSetting('auth.generic.oidc.scopes') || 'openid profile email',
                        providerName: getSetting('auth.generic.oidc.providerName') || '',
                    },
                    saml: {
                        entityId: getSetting('auth.generic.saml.entityId') || '',
                        ssoUrl: getSetting('auth.generic.saml.ssoUrl') || '',
                        x509: getSetting('auth.generic.saml.x509') || '',
                        metadataUrl: getSetting('auth.generic.saml.metadataUrl') || '',
                    },
                },
                ldap: {
                    enabled: getSetting('auth.ldap.enabled') === 'true',
                    url: getSetting('auth.ldap.url') || '',
                    bindDn: getSetting('auth.ldap.bindDn') || '',
                    bindPassword: getSetting('auth.ldap.bindPassword') || '',
                    searchBase: getSetting('auth.ldap.searchBase') || '',
                    searchFilter: getSetting('auth.ldap.searchFilter') || '(mail={{usermail}})',
                },
            });
        }
    }, [settings.length, form, getSetting]);

    const onSubmit = (data: z.infer<typeof authSettingsSchema>) => {
        // Validate Email OTP selection
        if (data.mfa?.methods?.includes('email')) {
            if (!emailConfigStatus?.enabled) {
                toast.error("Cannot enable Email OTP", {
                    description: "The Email feature is disabled. Enable it in Email Settings first."
                });
                return;
            }
            if (!emailConfigStatus?.configValid) {
                toast.error("Cannot enable Email OTP", {
                    description: "Email is enabled but not properly configured. Complete the configuration in Email Settings."
                });
                return;
            }
        }

        // Capabilities Guards
        if (capabilitiesError) {
            toast.error("Configuration error", { description: "Cannot save settings while capabilities are unavailable. Read-only mode is active." });
            return;
        }

        function getProviderDisplayName(key: string): string {
            const names: Record<string, string> = {
                azureAd: 'Azure AD',
                google: 'Google Workspace',
                generic: 'Generic SSO',
                ldap: 'LDAP',
                oidc_generic: 'OIDC Generic',
            };
            return names[key] || key;
        }

        const checkProvider = (capKey: string, propKey: string, isEnabled: boolean) => {
            if (!isEnabled || !capabilities) return true;

            if (!capabilities[capKey]?.implemented) {
                toast.error("Configuration error", {
                    description: `${getProviderDisplayName(propKey)} is not yet implemented in this version.`
                });
                return false;
            }

            // Check if the user has provided the required fields in the form they are currently submitting
            let isFormFilled = false;
            if (propKey === 'azureAd') {
                isFormFilled = !!(data.azureAd?.tenantId && data.azureAd?.clientId && data.azureAd?.clientSecret);
            } else if (propKey === 'google') {
                isFormFilled = !!(data.google?.clientId && data.google?.clientSecret);
            } else if (capKey === 'saml') {
                isFormFilled = !!(data.generic?.saml?.entityId && data.generic?.saml?.ssoUrl && data.generic?.saml?.x509);
            } else if (capKey === 'oidc_generic') {
                isFormFilled = !!(data.generic?.oidc?.issuer && data.generic?.oidc?.clientId && data.generic?.oidc?.clientSecret);
            } else if (propKey === 'ldap') {
                isFormFilled = !!(data.ldap?.url && data.ldap?.bindDn && data.ldap?.bindPassword && data.ldap?.searchBase);
            }

            if (!isFormFilled && !capabilities[capKey]?.configured) {
                toast.error("Configuration error", {
                    description: `Please configure all required fields first for ${getProviderDisplayName(propKey)}.`
                });
                return false;
            }
            return true;
        };

        if (!checkProvider('azure_ad', 'azureAd', data.azureAd.enabled)) return;
        if (!checkProvider('google_workspace', 'google', data.google.enabled)) return;
        if (!checkProvider('saml', 'generic', data.generic.enabled && data.generic.type === 'saml')) return;
        if (!checkProvider('oidc_generic', 'oidc_generic', data.generic.enabled && data.generic.type === 'oidc')) return;
        if (!checkProvider('ldap', 'ldap', data.ldap.enabled)) return;


        const payload: Record<string, string | boolean | undefined> = {
            // MFA & Security
            'auth.mfa.required': String(data.mfa?.required ?? false),
            'auth.mfa.methods': (data.mfa?.methods ?? []).join(','),
            'auth.passkeys.enabled': String(data.passkeys?.enabled ?? false),
            'auth.session.timeout': String(data.session?.timeout ?? 30),
            'auth.session.secureActions': String(data.session?.secureActions ?? true),

            // Access Requirements
            'auth.requirements.admin.mfa': String(data.requirements?.admin?.mfa || false),
            'auth.requirements.admin.passkeys': String(data.requirements?.admin?.passkeys || false),
            'auth.requirements.user.mfa': String(data.requirements?.user?.mfa || false),
            'auth.requirements.user.passkeys': String(data.requirements?.user?.passkeys || false),

            // Azure AD
            'auth.azureAd.enabled': String(data.azureAd.enabled),
        };

        if (data.azureAd.enabled) {
            payload['auth.azureAd.tenantId'] = data.azureAd.tenantId;
            payload['auth.azureAd.clientId'] = data.azureAd.clientId;
            payload['auth.azureAd.clientSecret'] = data.azureAd.clientSecret;
        }

        // Google
        payload['auth.google.enabled'] = String(data.google.enabled);
        if (data.google.enabled) {
            payload['auth.google.clientId'] = data.google.clientId;
            payload['auth.google.clientSecret'] = data.google.clientSecret;
            payload['auth.google.hostedDomain'] = data.google.hostedDomain;
        }

        // Generic
        payload['auth.generic.enabled'] = String(data.generic.enabled);
        if (data.generic.enabled) {
            payload['auth.generic.type'] = data.generic.type;
            if (data.generic.type === 'oidc') {
                payload['auth.generic.oidc.issuer'] = data.generic.oidc.issuer;
                payload['auth.generic.oidc.clientId'] = data.generic.oidc.clientId;
                payload['auth.generic.oidc.clientSecret'] = data.generic.oidc.clientSecret;
                payload['auth.generic.oidc.scopes'] = data.generic.oidc.scopes;
                payload['auth.generic.oidc.providerName'] = data.generic.oidc.providerName || '';
            } else {
                payload['auth.generic.saml.entityId'] = data.generic.saml.entityId;
                payload['auth.generic.saml.ssoUrl'] = data.generic.saml.ssoUrl;
                payload['auth.generic.saml.x509'] = data.generic.saml.x509;
                payload['auth.generic.saml.metadataUrl'] = data.generic.saml.metadataUrl;
            }
        }

        // LDAP
        payload['auth.ldap.enabled'] = String(data.ldap.enabled);
        if (data.ldap.enabled) {
            payload['auth.ldap.url'] = data.ldap.url;
            payload['auth.ldap.bindDn'] = data.ldap.bindDn;
            payload['auth.ldap.bindPassword'] = data.ldap.bindPassword;
            payload['auth.ldap.searchBase'] = data.ldap.searchBase;
            payload['auth.ldap.searchFilter'] = data.ldap.searchFilter;
        }

        updateSettings(payload as Record<string, string>);

        // Reset dirty state via setting default values to current values? 
        // Or assume react-hook-form does it if we passed data to defaultValues.
        // Actually updateSettings is async (optimistic with react-query usually), so we might not be able to reset immediately.
        // But for UX, we show toast.
        toast.success("Authentication settings updated");
    };

    if (isLoading || isLoadingCaps) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Determine MFA Policy based on state
    const mfaMethods = form.watch('mfa.methods') || [];
    const mfaRequired = form.watch('mfa.required');
    const mfaPolicy = (mfaMethods.length === 0) ? 'disabled' : (mfaRequired ? 'required' : 'optional');

    const handleMfaPolicyChange = (val: string) => {
        if (val === 'disabled') {
            form.setValue('mfa.required', false);
            form.setValue('mfa.methods', []);
        } else if (val === 'optional') {
            form.setValue('mfa.required', false);
            if ((form.getValues('mfa.methods') || []).length === 0) form.setValue('mfa.methods', ['authenticator']);
        } else if (val === 'required') {
            form.setValue('mfa.required', true);
            if ((form.getValues('mfa.methods') || []).length === 0) form.setValue('mfa.methods', ['authenticator']);
        }
    };

    // Validation Logic
    const validateProviderConfig = (type: string, data: z.infer<typeof authSettingsSchema>) => {
        const missing: string[] = [];
        let isValid = true;

        if (type === 'azure') {
            if (!data.azureAd?.tenantId) missing.push('Tenant ID');
            if (!data.azureAd?.clientId) missing.push('Client ID');
            if (!data.azureAd?.clientSecret) missing.push('Client Secret');
        } else if (type === 'google') {
            if (!data.google?.clientId) missing.push('Client ID');
            if (!data.google?.clientSecret) missing.push('Client Secret');
        } else if (type === 'oidc') {
            if (data.generic?.type === 'oidc') {
                if (!data.generic?.oidc?.issuer) missing.push('Issuer URL');
                if (!data.generic?.oidc?.clientId) missing.push('Client ID');
                if (!data.generic?.oidc?.clientSecret) missing.push('Client Secret');
            } else { // SAML
                if (!data.generic?.saml?.entityId) missing.push('Entity ID');
                if (!data.generic?.saml?.ssoUrl) missing.push('SSO URL');
                if (!data.generic?.saml?.x509) missing.push('X.509 Certificate');
            }
        } else if (type === 'ldap') {
            if (!data.ldap?.url) missing.push('LDAP URL');
            if (!data.ldap?.bindDn) missing.push('Bind DN');
            if (!data.ldap?.bindPassword) missing.push('Bind Password');
            if (!data.ldap?.searchBase) missing.push('Search Base');
        }

        if (missing.length > 0) isValid = false;
        return { isValid, missing };
    };

    const handleTestConnection = async (type: string) => {
        const resultType = type === 'oidc' && form.getValues('generic.type') === 'saml' ? 'saml' : type;
        setValidatingProvider(type);
        setTestResults(prev => ({ ...prev, [resultType]: { status: 'testing' } }));

        const data = form.getValues();
        const validation = validateProviderConfig(type, data);

        if (!validation.isValid) {
            setTestResults(prev => ({
                ...prev,
                [resultType]: { status: 'error', message: `Missing configuration: ${validation.missing.join(', ')}` }
            }));
            setValidatingProvider(null);
            return;
        }

        try {
            let res: { success: boolean, message: string } | undefined;
            if (type === 'ldap' && data.ldap) {
                res = await settingsApi.testLdapConnection({
                    url: data.ldap.url as string,
                    bindDn: data.ldap.bindDn,
                    bindPassword: data.ldap.bindPassword,
                    searchBase: data.ldap.searchBase as string,
                    searchFilter: data.ldap.searchFilter,
                });
            } else if (type === 'azure' && data.azureAd) {
                res = await settingsApi.testAzureAd({
                    tenantId: data.azureAd.tenantId || '',
                    clientId: data.azureAd.clientId || '',
                    clientSecret: data.azureAd.clientSecret || '',
                });
            } else if (type === 'google' && data.google) {
                res = await settingsApi.testGoogleOAuth({
                    clientId: data.google.clientId || '',
                    clientSecret: data.google.clientSecret || '',
                    hostedDomain: data.google.hostedDomain,
                });
            } else if (type === 'oidc') {
                if (data.generic.type === 'saml' && data.generic.saml) {
                    res = await settingsApi.testSaml({
                        entityId: data.generic.saml.entityId || '',
                        ssoUrl: data.generic.saml.ssoUrl || '',
                        x509: data.generic.saml.x509 || '',
                        metadataUrl: data.generic.saml.metadataUrl,
                    });
                } else if (data.generic.type === 'oidc') {
                    res = await settingsApi.testOidcGeneric({
                        issuer: data.generic.oidc.issuer || '',
                        clientId: data.generic.oidc.clientId || '',
                        clientSecret: data.generic.oidc.clientSecret || '',
                        scopes: data.generic.oidc.scopes || 'openid email profile',
                    });
                }
            }

            if (res?.success) {
                setTestResults(prev => ({ ...prev, [resultType]: { status: 'success', message: '✓ Configuration valid' } }));
            } else {
                const isTimeout = res?.message?.toLowerCase().includes('timeout');
                setTestResults(prev => ({
                    ...prev,
                    [resultType]: { status: isTimeout ? 'timeout' : 'error', message: res?.message || "Unknown error" }
                }));
            }
        } catch (err: unknown) {
            let errorMessage = "Unknown error";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'object' && err !== null && 'response' in err) {
                errorMessage = (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Unknown error";
            }
            const isTimeout = errorMessage.toLowerCase().includes('timeout');
            setTestResults(prev => ({
                ...prev,
                [resultType]: { status: isTimeout ? 'timeout' : 'error', message: errorMessage }
            }));
        } finally {
            refreshCapabilities();
            setValidatingProvider(null);
        }
    };

    // Current config checks
    const azureValidation = validateProviderConfig('azure', form.watch());
    const googleValidation = validateProviderConfig('google', form.watch());
    const oidcValidation = validateProviderConfig('oidc', form.watch());
    const ldapValidation = validateProviderConfig('ldap', form.watch());

    // Is form dirty?
    const isDirty = form.formState.isDirty;

    const TestResultAlert = ({ type }: { type: string }) => {
        const result = testResults[type];
        if (!result || result.status === 'idle' || result.status === 'testing') return null;

        if (result.status === 'success') {
            return (
                <Alert className="bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{result.message}</AlertDescription>
                </Alert>
            );
        }

        if (result.status === 'timeout') {
            return (
                <Alert className="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle>Connection test timed out</AlertTitle>
                    <AlertDescription>{result.message || 'The connection timed out after 5 seconds'}</AlertDescription>
                </Alert>
            );
        }

        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Connection failed</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
            </Alert>
        );
    };

    return (
        <div className="space-y-6 max-w-6xl">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                    const failingKeys = Object.keys(errors).join(', ');
                    console.error("Form validation errors:", errors);
                    toast.error("Form validation failed", {
                        description: `Check the following tabs/fields for errors: ${failingKeys}`
                    });
                })} className="space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                        <div className="flex items-center justify-between">
                            <TabsList>
                                <TabsTrigger value="auth" className="gap-2"><Shield className="h-4 w-4" /> Providers</TabsTrigger>
                                <TabsTrigger value="mfa" className="gap-2"><Smartphone className="h-4 w-4" /> MFA</TabsTrigger>
                                <TabsTrigger value="passkeys" className="gap-2"><Key className="h-4 w-4" /> Passkeys</TabsTrigger>
                                <TabsTrigger value="requirements" className="gap-2"><Lock className="h-4 w-4" /> Enforcements</TabsTrigger>
                                <TabsTrigger value="sessions" className="gap-2"><Clock className="h-4 w-4" /> Sessions</TabsTrigger>
                            </TabsList>
                            <Button type="submit" disabled={isUpdating || !isDirty || capabilitiesError || isLoadingCaps}>
                                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </div>

                        {/* AUTHENTICATION PROVIDERS */}
                        <TabsContent value="auth" className="space-y-6">

                            <Alert>
                                <Info className="h-4 w-4 text-blue-500" />
                                <AlertTitle>Information</AlertTitle>
                                <AlertDescription>
                                    External identity providers allow users to sign in with their organization accounts.
                                    Local authentication remains available as a fallback unless explicitly disabled.
                                </AlertDescription>
                            </Alert>

                            {capabilitiesError && (
                                <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900">
                                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                    <AlertTitle>Connection Error</AlertTitle>
                                    <AlertDescription>
                                        Failed to verify authentication capabilities with the server. Settings have been locked in read-only mode to prevent invalid configurations.
                                    </AlertDescription>
                                </Alert>
                            )}

                            <TooltipProvider>
                                <Tabs value={providerTab} onValueChange={setProviderTab} className="w-full">
                                    <TabsList className="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <TabsTrigger value="azure" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none pb-2 bg-transparent text-muted-foreground data-[state=active]:text-foreground">
                                                    Azure AD
                                                    {/* Status Dot */}
                                                    {form.watch('azureAd.enabled') && (
                                                        <div className={cn("ml-2 h-2 w-2 rounded-full", azureValidation.isValid ? "bg-green-500" : "bg-amber-500")} />
                                                    )}
                                                </TabsTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent>For Microsoft 365 and Azure Active Directory accounts</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <TabsTrigger value="google" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none pb-2 bg-transparent text-muted-foreground data-[state=active]:text-foreground">
                                                    Google Workspace
                                                    {form.watch('google.enabled') && (
                                                        <div className={cn("ml-2 h-2 w-2 rounded-full", googleValidation.isValid ? "bg-green-500" : "bg-amber-500")} />
                                                    )}
                                                </TabsTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent>For Google Workspace accounts with optional domain restriction</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <TabsTrigger value="oidc" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none pb-2 bg-transparent text-muted-foreground data-[state=active]:text-foreground">
                                                    OIDC / SAML
                                                    {form.watch('generic.enabled') && (
                                                        <div className={cn("ml-2 h-2 w-2 rounded-full", oidcValidation.isValid ? "bg-green-500" : "bg-amber-500")} />
                                                    )}
                                                </TabsTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent>For custom OpenID Connect providers (Keycloak, Okta, Auth0, etc.) or enterprise SAML 2.0</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <TabsTrigger value="ldap" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none pb-2 bg-transparent text-muted-foreground data-[state=active]:text-foreground">
                                                    LDAP
                                                    {form.watch('ldap.enabled') && (
                                                        <div className={cn("ml-2 h-2 w-2 rounded-full", ldapValidation.isValid ? "bg-green-500" : "bg-amber-500")} />
                                                    )}
                                                </TabsTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent>For Active Directory and OpenLDAP directory services</TooltipContent>
                                        </Tooltip>
                                    </TabsList>

                                    {/* Azure AD */}
                                    <TabsContent value="azure" className="mt-6">
                                        <Card>
                                            <CardHeader>
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1">
                                                        <CardTitle className="flex items-center gap-2">
                                                            Azure Active Directory
                                                            <ProviderBadge capabilityKey="azure_ad" providerType="azure" />
                                                            {form.watch('azureAd.enabled') && !azureValidation.isValid && (
                                                                <Badge variant="outline" className="ml-2 border-amber-500 text-amber-500">Incomplete configuration</Badge>
                                                            )}
                                                        </CardTitle>
                                                        <CardDescription>Allow users to sign in with Microsoft Entra ID accounts</CardDescription>
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="azureAd.enabled"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isProviderDisabled('azure_ad')} />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </CardHeader>
                                            {form.watch('azureAd.enabled') && (
                                                <CardContent className="space-y-6">
                                                    {!azureValidation.isValid && (
                                                        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                                            Please complete all required fields (Tenant ID, Client ID, Secret) to activate this provider.
                                                        </div>
                                                    )}
                                                    <div className="space-y-4">
                                                        <FormField
                                                            control={form.control}
                                                            name="azureAd.tenantId"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Tenant ID <span className="text-destructive">*</span></FormLabel>
                                                                    <FormControl><Input placeholder="00000000-0000-0000-0000-000000000000" {...field} /></FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <div className="grid md:grid-cols-2 gap-4">
                                                            <FormField
                                                                control={form.control}
                                                                name="azureAd.clientId"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Client ID <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name="azureAd.clientSecret"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Client Secret <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                    </div>
                                                    <TestResultAlert type="azure" />
                                                    <div className="flex justify-end pt-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleTestConnection('azure')}
                                                            disabled={validatingProvider === 'azure' || !azureValidation.isValid}
                                                        >
                                                            {validatingProvider === 'azure' ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                            )}
                                                            Test Configuration
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            )}
                                        </Card>
                                    </TabsContent>

                                    {/* Google */}
                                    <TabsContent value="google">
                                        <Card>
                                            <CardHeader>
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1">
                                                        <CardTitle className="flex items-center gap-2">
                                                            Google Workspace
                                                            <ProviderBadge capabilityKey="google_workspace" providerType="google" />
                                                            {form.watch('google.enabled') && !googleValidation.isValid && (
                                                                <Badge variant="outline" className="ml-2 border-amber-500 text-amber-500">Incomplete configuration</Badge>
                                                            )}
                                                        </CardTitle>
                                                        <CardDescription>Allow users to sign in with Google Workspace accounts</CardDescription>
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="google.enabled"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isProviderDisabled('google_workspace')} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </CardHeader>
                                            {form.watch('google.enabled') && (
                                                <CardContent className="space-y-6">
                                                    {!googleValidation.isValid && (
                                                        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                                            Please complete required fields (Client ID, Secret).
                                                        </div>
                                                    )}
                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        <FormField
                                                            control={form.control}
                                                            name="google.clientId"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Client ID <span className="text-destructive">*</span></FormLabel>
                                                                    <FormControl><Input {...field} /></FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <FormField
                                                            control={form.control}
                                                            name="google.clientSecret"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Client Secret <span className="text-destructive">*</span></FormLabel>
                                                                    <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="google.hostedDomain"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Hosted Domain (Optional)</FormLabel>
                                                                <FormControl><Input placeholder="example.com" {...field} /></FormControl>
                                                                <FormDescription>Restrict login to a specific Google Workspace domain</FormDescription>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <TestResultAlert type="google" />
                                                    <div className="flex justify-end pt-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleTestConnection('google')}
                                                            disabled={validatingProvider === 'google' || !googleValidation.isValid}
                                                        >
                                                            {validatingProvider === 'google' ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                            )}
                                                            Test Configuration
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            )}
                                        </Card>
                                    </TabsContent>

                                    {/* OIDC/SAML */}
                                    <TabsContent value="oidc">
                                        <Card>
                                            <CardHeader>
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1">
                                                        <CardTitle className="flex items-center gap-2">
                                                            Generic Identity Provider
                                                            <ProviderBadge capabilityKey={form.watch('generic.type') === 'saml' ? 'saml' : 'oidc_generic'} providerType={form.watch('generic.type') === 'saml' ? 'saml' : 'oidc'} />
                                                            {form.watch('generic.enabled') && !oidcValidation.isValid && (
                                                                <Badge variant="outline" className="ml-2 border-amber-500 text-amber-500">Incomplete configuration</Badge>
                                                            )}
                                                        </CardTitle>
                                                        <CardDescription>Connect via OpenID Connect (OIDC) or SAML 2.0 protocol</CardDescription>
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="generic.enabled"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isProviderDisabled(form.watch('generic.type') === 'saml' ? 'saml' : 'oidc_generic')} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </CardHeader>
                                            {form.watch('generic.enabled') && (
                                                <CardContent className="space-y-6">
                                                    {!oidcValidation.isValid && (
                                                        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                                            Please complete all required fields for {form.watch('generic.type') === 'oidc' ? 'OIDC' : 'SAML'}.
                                                        </div>
                                                    )}
                                                    <FormField
                                                        control={form.control}
                                                        name="generic.type"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Protocol Type</FormLabel>
                                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                    <FormControl><SelectTrigger><SelectValue placeholder="Select protocol" /></SelectTrigger></FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                                                                        <SelectItem value="saml">SAML 2.0</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    {form.watch('generic.type') === 'oidc' ? (
                                                        <div className="space-y-4 border-l-2 border-primary/20 pl-4">
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.oidc.issuer"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Issuer URL <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input placeholder="https://auth.example.com" {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <div className="grid md:grid-cols-2 gap-4">
                                                                <FormField
                                                                    control={form.control}
                                                                    name="generic.oidc.clientId"
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Client ID <span className="text-destructive">*</span></FormLabel>
                                                                            <FormControl><Input {...field} /></FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <FormField
                                                                    control={form.control}
                                                                    name="generic.oidc.clientSecret"
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Client Secret <span className="text-destructive">*</span></FormLabel>
                                                                            <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.oidc.scopes"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Scopes</FormLabel>
                                                                        <FormControl><Input {...field} /></FormControl>
                                                                        <FormDescription>Space-separated scopes (e.g., openid profile email)</FormDescription>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.oidc.providerName"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Provider Name</FormLabel>
                                                                        <FormControl><Input placeholder="e.g. Keycloak, Okta..." {...field} /></FormControl>
                                                                        <FormDescription>Display name shown on the login button</FormDescription>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4 border-l-2 border-primary/20 pl-4">
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.saml.entityId"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Entity ID (Issuer) <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.saml.ssoUrl"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>SSO URL <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Input placeholder="https://idp.example.com/sso" {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.saml.x509"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>X.509 Certificate <span className="text-destructive">*</span></FormLabel>
                                                                        <FormControl><Textarea className="font-mono text-xs" placeholder="-----BEGIN CERTIFICATE-----..." rows={5} {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <FormField
                                                                control={form.control}
                                                                name="generic.saml.metadataUrl"
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Metadata URL</FormLabel>
                                                                        <FormControl><Input placeholder="https://idp.example.com/metadata.xml" {...field} /></FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                    )}
                                                    <TestResultAlert type={form.watch('generic.type') === 'saml' ? 'saml' : 'oidc'} />
                                                    <div className="flex justify-end pt-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleTestConnection('oidc')}
                                                            disabled={validatingProvider === 'oidc' || !oidcValidation.isValid}
                                                        >
                                                            {validatingProvider === 'oidc' ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                            )}
                                                            Test Configuration
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            )}
                                        </Card>
                                    </TabsContent>

                                    {/* LDAP */}
                                    <TabsContent value="ldap">
                                        <Card>
                                            <CardHeader>
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1">
                                                        <CardTitle className="flex items-center gap-2">
                                                            LDAP / Active Directory
                                                            <ProviderBadge capabilityKey="ldap" providerType="ldap" />
                                                            {form.watch('ldap.enabled') && !ldapValidation.isValid && (
                                                                <Badge variant="outline" className="ml-2 border-amber-500 text-amber-500">Incomplete configuration</Badge>
                                                            )}
                                                        </CardTitle>
                                                        <CardDescription>Connect to legacy Active Directory or OpenLDAP</CardDescription>
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="ldap.enabled"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isProviderDisabled('ldap')} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </CardHeader>
                                            {form.watch('ldap.enabled') && (
                                                <CardContent className="space-y-6">
                                                    {!ldapValidation.isValid && (
                                                        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                                                            Please complete required fields (URL, Bind DN, Password, Search Base).
                                                        </div>
                                                    )}
                                                    <FormField
                                                        control={form.control}
                                                        name="ldap.url"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>LDAP URL <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl><Input placeholder="ldaps://ldap.example.com:636" {...field} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        <FormField
                                                            control={form.control}
                                                            name="ldap.bindDn"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Bind DN <span className="text-destructive">*</span></FormLabel>
                                                                    <FormControl><Input placeholder="cn=admin,dc=example,dc=com" {...field} /></FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <FormField
                                                            control={form.control}
                                                            name="ldap.bindPassword"
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Bind Password <span className="text-destructive">*</span></FormLabel>
                                                                    <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                    <FormField
                                                        control={form.control}
                                                        name="ldap.searchBase"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Search Base <span className="text-destructive">*</span></FormLabel>
                                                                <FormControl><Input placeholder="ou=users,dc=example,dc=com" {...field} /></FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="ldap.searchFilter"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Search Filter</FormLabel>
                                                                <FormControl><Input placeholder="(mail={{usermail}})" {...field} /></FormControl>
                                                                <FormDescription>Must contain <code>{'{{usermail}}'}</code> placeholder</FormDescription>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <TestResultAlert type="ldap" />
                                                    <div className="flex justify-end pt-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleTestConnection('ldap')}
                                                            disabled={validatingProvider === 'ldap' || !ldapValidation.isValid}
                                                        >
                                                            {validatingProvider === 'ldap' ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                            )}
                                                            Test Configuration
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            )}
                                        </Card>
                                    </TabsContent>

                                </Tabs>
                            </TooltipProvider>
                        </TabsContent>

                        {/* MFA TAB */}
                        <TabsContent value="mfa" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>MFA Policy</CardTitle>
                                    <CardDescription>Determine who must use Multi-Factor Authentication</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <RadioGroup value={mfaPolicy} onValueChange={handleMfaPolicyChange} className="space-y-4">
                                        <div className="flex items-start space-x-3">
                                            <RadioGroupItem value="disabled" id="mfa-disabled" className="mt-1" />
                                            <div className="grid gap-0.5">
                                                <Label htmlFor="mfa-disabled" className="font-medium text-base">Disabled</Label>
                                                <p className="text-sm text-muted-foreground">MFA is completely disabled. Users cannot configure it.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start space-x-3">
                                            <RadioGroupItem value="optional" id="mfa-optional" className="mt-1" />
                                            <div className="grid gap-0.5">
                                                <Label htmlFor="mfa-optional" className="font-medium text-base">Optional (Users may enable)</Label>
                                                <p className="text-sm text-muted-foreground">Recommended. Users can choose to enable MFA from their profile.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start space-x-3">
                                            <RadioGroupItem value="required" id="mfa-required" className="mt-1" />
                                            <div className="grid gap-0.5">
                                                <Label htmlFor="mfa-required" className="font-medium text-base">Required for all users</Label>
                                                <p className="text-sm text-muted-foreground">All users must set up MFA to access the system. Good for high security.</p>
                                            </div>
                                        </div>
                                    </RadioGroup>
                                </CardContent>
                            </Card>

                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold">Allowed Methods</h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <Card className={cn(
                                        "relative cursor-pointer transition-all border-2",
                                        mfaPolicy === 'disabled' ? "opacity-50 grayscale" : "hover:border-primary/50",
                                        form.watch('mfa.methods')?.includes('authenticator') ? "border-primary bg-primary/5" : "border-transparent"
                                    )}>
                                        <div className="absolute top-2 right-2">
                                            <Checkbox
                                                checked={form.watch('mfa.methods')?.includes('authenticator')}
                                                disabled={mfaPolicy === 'disabled'}
                                                onCheckedChange={(checked) => {
                                                    const current = form.getValues('mfa.methods') || [];
                                                    if (checked) {
                                                        form.setValue('mfa.methods', [...current, 'authenticator']);
                                                    } else {
                                                        form.setValue('mfa.methods', current.filter(m => m !== 'authenticator'));
                                                    }
                                                }}
                                            />
                                        </div>
                                        <CardHeader>
                                            <Smartphone className="h-8 w-8 mb-2 text-primary" />
                                            <CardTitle className="text-base">Authenticator App</CardTitle>
                                            <CardDescription>TOTP (Google Auth, Authy)</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <Badge variant="secondary" className="bg-primary/20 text-primary">Recommended</Badge>
                                        </CardContent>
                                    </Card>

                                    {/* Email OTP Card - Always visible, greyed out based on state */}
                                    <Card className={cn(
                                        "relative transition-all border-2",
                                        mfaPolicy === 'disabled' || !emailConfigStatus?.enabled || !emailConfigStatus?.configValid
                                            ? "opacity-50 grayscale cursor-not-allowed"
                                            : "cursor-pointer hover:border-primary/50",
                                        form.watch('mfa.methods')?.includes('email') ? "border-primary bg-primary/5" : "border-transparent"
                                    )}>
                                        <div className="absolute top-2 right-2">
                                            <Checkbox
                                                checked={form.watch('mfa.methods')?.includes('email')}
                                                disabled={mfaPolicy === 'disabled' || !emailConfigStatus?.enabled || !emailConfigStatus?.configValid}
                                                onCheckedChange={(checked) => {
                                                    const current = form.getValues('mfa.methods') || [];
                                                    if (checked) {
                                                        form.setValue('mfa.methods', [...current, 'email']);
                                                    } else {
                                                        form.setValue('mfa.methods', current.filter(m => m !== 'email'));
                                                    }
                                                }}
                                            />
                                        </div>
                                        <CardHeader>
                                            <Mail className="h-8 w-8 mb-2 text-primary" />
                                            <CardTitle className="text-base">Email OTP</CardTitle>
                                            <CardDescription>One-time code via email</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {!emailConfigStatus?.enabled ? (
                                                <div className="space-y-2">
                                                    <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                                                        Feature Disabled
                                                    </Badge>
                                                    <p className="text-xs text-muted-foreground">
                                                        Email feature is disabled.
                                                    </p>
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="h-auto p-0 text-xs"
                                                        type="button"
                                                        onClick={() => window.location.href = '/settings/email'}
                                                    >
                                                        <Settings className="h-3 w-3 mr-1" />
                                                        Enable in Email Settings
                                                    </Button>
                                                </div>
                                            ) : !emailConfigStatus?.configValid ? (
                                                <div className="space-y-2">
                                                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                                                        Configuration Required
                                                    </Badge>
                                                    <p className="text-xs text-muted-foreground">
                                                        Email sending is not configured.
                                                    </p>
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="h-auto p-0 text-xs"
                                                        type="button"
                                                        onClick={() => window.location.href = '/settings/email'}
                                                    >
                                                        <Settings className="h-3 w-3 mr-1" />
                                                        Configure Email Settings
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Badge variant="secondary">Available</Badge>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>

                        {/* PASSKEYS TAB */}
                        <TabsContent value="passkeys" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <CardTitle>Passwordless Authentication</CardTitle>
                                            <CardDescription>
                                                Allow users to sign in using biometrics (FaceID, TouchID) or security keys (YubiKey).
                                                <br />Recommended for modern browsers and high-security environments.
                                            </CardDescription>
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="passkeys.enabled"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </CardHeader>
                                {form.watch('passkeys.enabled') && (
                                    <CardContent className="space-y-6 animate-in fade-in slide-in-from-top-2">
                                        {/* Inline Alert - New */}
                                        <div className="bg-primary/10 text-primary-900 dark:text-primary-100 rounded-md p-3 flex gap-3 text-sm items-start border border-primary/20">
                                            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                                            <p>Passkeys will be available to all users. Users must register them from their profile before they can be used.</p>
                                        </div>

                                        {/* Password Fallback Alert - Replaces Checkbox */}
                                        <Alert variant="default" className="bg-muted border-none">
                                            <Info className="h-4 w-4 text-blue-500" />
                                            <AlertTitle>Password fallback is always enabled</AlertTitle>
                                            <AlertDescription>
                                                Password-based authentication remains available to prevent lockouts.
                                                This behavior cannot be disabled.
                                            </AlertDescription>
                                        </Alert>

                                        {/* Adoption Block - New (Read-only) */}
                                        <div className="border rounded-lg p-4 space-y-3">
                                            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Adoption</h4>
                                            <div className="flex items-center gap-8">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <p className="text-2xl font-bold">0</p>
                                                        <p className="text-xs text-muted-foreground">Users</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                                        <Laptop className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <p className="text-2xl font-bold">0</p>
                                                        <p className="text-xs text-muted-foreground">Devices</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground pt-1">No passkeys registered yet.</p>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        </TabsContent>

                        {/* REQUIREMENTS TAB - Modern Premium Design */}
                        <TabsContent value="requirements" className="space-y-6">
                            <div className={cn(
                                "relative rounded-xl border bg-gradient-to-br from-background to-muted/30 overflow-hidden transition-all duration-300",
                                (mfaPolicy === 'disabled' && !form.watch('passkeys.enabled')) && "opacity-50 pointer-events-none"
                            )}>
                                {/* Decorative accent */}
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

                                <div className="p-6 space-y-6">
                                    {/* Header */}
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-primary/10">
                                                    <Lock className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-semibold tracking-tight">Access Requirements</h3>
                                                    <p className="text-sm text-muted-foreground">Define authentication requirements per role</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Disabled state message */}
                                    {(mfaPolicy === 'disabled' && !form.watch('passkeys.enabled')) && (
                                        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-dashed">
                                            <Info className="h-5 w-5 text-blue-500 shrink-0" />
                                            <p className="text-sm text-muted-foreground">
                                                Enable MFA or Passkeys to configure access requirements for different roles.
                                            </p>
                                        </div>
                                    )}

                                    {/* Requirements Grid */}
                                    {(mfaPolicy !== 'disabled' || form.watch('passkeys.enabled')) && (
                                        <div className="grid gap-4">
                                            {/* Admin Role */}
                                            <div className="group relative p-5 rounded-lg border bg-card hover:shadow-md transition-all duration-200">
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                                                            <ShieldCheck className="h-5 w-5 text-amber-600" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-medium">Administrators</h4>
                                                                <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600">High privilege</Badge>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground mt-0.5">Full system access and configuration rights</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {mfaPolicy !== 'disabled' && (
                                                            <Button
                                                                type="button"
                                                                variant={form.watch('requirements.admin.mfa') ? 'default' : 'outline'}
                                                                size="sm"
                                                                className={cn(
                                                                    "gap-2 transition-all",
                                                                    form.watch('requirements.admin.mfa') && "bg-primary text-primary-foreground"
                                                                )}
                                                                onClick={() => form.setValue('requirements.admin.mfa', !form.watch('requirements.admin.mfa'))}
                                                            >
                                                                <Smartphone className="h-4 w-4" />
                                                                MFA
                                                                {form.watch('requirements.admin.mfa') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                            </Button>
                                                        )}
                                                        {form.watch('passkeys.enabled') && (
                                                            <Button
                                                                type="button"
                                                                variant={form.watch('requirements.admin.passkeys') ? 'default' : 'outline'}
                                                                size="sm"
                                                                className={cn(
                                                                    "gap-2 transition-all",
                                                                    form.watch('requirements.admin.passkeys') && "bg-primary text-primary-foreground"
                                                                )}
                                                                onClick={() => form.setValue('requirements.admin.passkeys', !form.watch('requirements.admin.passkeys'))}
                                                            >
                                                                <Key className="h-4 w-4" />
                                                                Passkeys
                                                                {form.watch('requirements.admin.passkeys') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* User Role */}
                                            <div className="group relative p-5 rounded-lg border bg-card hover:shadow-md transition-all duration-200">
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 rounded-full bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                                                            <UserCog className="h-5 w-5 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-medium">Users</h4>
                                                                <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600">Standard</Badge>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground mt-0.5">Regular users with task management access</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {mfaPolicy !== 'disabled' && (
                                                            <Button
                                                                type="button"
                                                                variant={form.watch('requirements.user.mfa') ? 'default' : 'outline'}
                                                                size="sm"
                                                                className={cn(
                                                                    "gap-2 transition-all",
                                                                    form.watch('requirements.user.mfa') && "bg-primary text-primary-foreground"
                                                                )}
                                                                onClick={() => form.setValue('requirements.user.mfa', !form.watch('requirements.user.mfa'))}
                                                            >
                                                                <Smartphone className="h-4 w-4" />
                                                                MFA
                                                                {form.watch('requirements.user.mfa') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                            </Button>
                                                        )}
                                                        {form.watch('passkeys.enabled') && (
                                                            <Button
                                                                type="button"
                                                                variant={form.watch('requirements.user.passkeys') ? 'default' : 'outline'}
                                                                size="sm"
                                                                className={cn(
                                                                    "gap-2 transition-all",
                                                                    form.watch('requirements.user.passkeys') && "bg-primary text-primary-foreground"
                                                                )}
                                                                onClick={() => form.setValue('requirements.user.passkeys', !form.watch('requirements.user.passkeys'))}
                                                            >
                                                                <Key className="h-4 w-4" />
                                                                Passkeys
                                                                {form.watch('requirements.user.passkeys') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Info footer */}
                                    {(mfaPolicy !== 'disabled' || form.watch('passkeys.enabled')) && (
                                        <p className="text-xs text-muted-foreground pt-2 border-t">
                                            Users will be prompted to set up required authentication methods on their next login.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* SESSIONS TAB */}
                        <TabsContent value="sessions" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Session Policies</CardTitle>
                                    <CardDescription>Control how long users stay logged in and when they must re-authenticate.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <FormField
                                        control={form.control}
                                        name="session.timeout"
                                        render={({ field }) => (
                                            <FormItem className="space-y-2">
                                                <FormLabel>Auto-logout after inactivity (minutes)</FormLabel>
                                                <div className="flex items-center gap-4">
                                                    <FormControl>
                                                        <div className="flex items-center space-x-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-10 w-10 shrink-0"
                                                                onClick={() => {
                                                                    const val = parseInt(String(field.value) || '0', 10);
                                                                    if (val > 5) field.onChange(val - 5);
                                                                }}
                                                                disabled={parseInt(String(field.value) || '0', 10) <= 5}
                                                            >
                                                                <Minus className="h-4 w-4" />
                                                            </Button>
                                                            <div className="w-24">
                                                                <Input
                                                                    type="number"
                                                                    className="text-center font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    {...field}
                                                                    value={parseInt(String(field.value) || '0', 10)}
                                                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                                                />
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-10 w-10 shrink-0"
                                                                onClick={() => {
                                                                    const val = parseInt(String(field.value) || '0', 10);
                                                                    field.onChange(val + 5);
                                                                }}
                                                            >
                                                                <Plus className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </FormControl>
                                                    <span className="text-sm text-muted-foreground">Does not affect API tokens</span>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Separator />

                                    <FormField
                                        control={form.control}
                                        name="session.secureActions"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                    <FormLabel className="text-base">Secure Actions</FormLabel>
                                                    <FormDescription>
                                                        Require re-authentication for sensitive actions (e.g. changing password, updating security settings)
                                                    </FormDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <div className="pt-4 flex justify-end">
                                        <Button type="button" disabled variant="outline" className="opacity-50 text-destructive border-destructive/50 hover:bg-destructive/10">
                                            Invalidate all active sessions (Coming Soon)
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                    </Tabs>
                </form>
            </Form>
        </div>
    );
}
