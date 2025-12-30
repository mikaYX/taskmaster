import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TaskItem } from "@/components/TaskItem";
import { LoginDialog } from "@/components/LoginDialog";
import { SetupDialog } from "@/components/SetupDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { EditTaskDialog } from "@/components/EditTaskDialog";
import { AdminTasksDialog } from "@/components/AdminTasksDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { t, I18N, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { apiFetch, clearAuthToken, downloadWithAuth, setAuthToken, refreshAuthToken, getAuthToken } from "@/lib/api";
import { isoYMD, endOfMonthYMD } from "@/lib/utils";
import { applyTheme } from "@/lib/themes";
import { TaskActionDialog } from "@/components/TaskActionDialog";
import { DashboardPage } from "@/components/DashboardPage";
import { LogIn, LogOut, Settings, RefreshCw, Search, FileSpreadsheet, FileText, BarChart2, User, Download, Bookmark } from 'lucide-react';
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { AuthErrorDialog } from "@/components/AuthErrorDialog";
import { DatePicker } from "@/components/DatePicker";
import { Toaster } from "@/components/ui/toaster";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function App() {
  // Config & Session
  const [cfg, setCfg] = useState({ lang: "EN", country: "FR", title: "Taskmaster" });
  const [role, setRole] = useState("guest"); // guest | user | admin
  const [currentUser, setCurrentUser] = useState(null); // Full user object from session
  const [lang, setLang] = useState("EN");
  const [loading, setLoading] = useState(true);

  // Data
  const [tasks, setTasks] = useState([]);

  // Filters
  const [from, setFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [to, setTo] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [statusFilter, setStatusFilter] = useState("pending"); // all, pending, validated, failed, missing
  const [periodFilter, setPeriodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false); // Filter to show only assigned tasks (default false)


  // Modals
  const [loginType, setLoginType] = useState(null); // 'user' | 'admin' | null
  const [authError, setAuthError] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showAdminTasks, setShowAdminTasks] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState(null);
  const [showEditTask, setShowEditTask] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null = create new

  // 2.0 Features

  const [presets, setPresets] = useState([]);

  // Action Dialog
  const [actionDialog, setActionDialog] = useState({ isOpen: false, type: null, task: null });

  // Initial Load
  useEffect(() => {
    // Check for token in URL (Azure SSO redirect)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setAuthToken(token);
      // Remove token from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    const errorMsg = params.get('error');
    if (errorMsg) {
      setAuthError(decodeURIComponent(errorMsg));
      // Remove error from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    loadConfig();
    fetchPresets(); // Load saved filters

    if (window.location.hash === '#dashboard') {
      setShowDashboard(true);
    }
  }, []);

  const fetchPresets = async () => {
    try {
      const res = await apiFetch("/api/export-filters");
      if (res.ok) setPresets(await res.json());
    } catch (e) {
      console.error("Fetch presets error", e);
    }
  };

  useEffect(() => {
    if (showDashboard) {
      window.history.replaceState(null, '', '#dashboard');
    } else {
      // Only clear if we were on dashboard. If we just loaded, we might be on root.
      if (window.location.hash === '#dashboard') {
        window.history.replaceState(null, '', ' ');
      }
    }
  }, [showDashboard]);

  // Update HTML lang attribute
  useEffect(() => {
    document.documentElement.lang = lang === "FR" ? "fr" : "en";
  }, [lang]);

  // Apply theme
  useEffect(() => {
    if (cfg.theme) {
      applyTheme(cfg.theme);
    }
  }, [cfg.theme]);

  // Apply display mode (dark/light/system)
  useEffect(() => {
    const applyDisplayMode = (mode) => {
      const root = document.documentElement;

      if (mode === 'dark') {
        root.classList.add('dark');
      } else if (mode === 'light') {
        root.classList.remove('dark');
      } else if (mode === 'system') {
        // Follow system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    const mode = cfg.display_mode || 'system';
    applyDisplayMode(mode);

    // Listen for system preference changes when in system mode
    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      };

      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [cfg.display_mode]);

  // Set default showOnlyMyTasks based on role
  useEffect(() => {
    if (role === 'user') {
      setShowOnlyMyTasks(true); // Users see only their tasks by default
    } else if (role === 'admin') {
      setShowOnlyMyTasks(false); // Admins see all tasks by default
    }
  }, [role]);

  // Reload tasks when filters or role change (immediate)
  useEffect(() => {
    if (!loading) fetchTasks();
  }, [from, to, statusFilter, role, loading, cfg]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loading) fetchTasks();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadConfig = async () => {
    try {
      // Refresh token if user is already logged in (updates groups without logout)
      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          await refreshAuthToken();
        } catch (e) {
          console.log('Token refresh skipped or failed:', e);
          // Continue anyway - maybe token expired or server issue
        }
      }

      const c = await apiFetch("/api/config").then(r => r.json());
      setCfg(c);
      setLang(c.lang || "EN");
      document.title = c.title || "Taskmaster";

      // Update Favicon
      if (c.favicon_url) {
        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = c.favicon_url;
        document.getElementsByTagName('head')[0].appendChild(link);
      }

      // Session check
      // Session check
      const session = await apiFetch("/api/session").then(r => r.json()).catch(() => ({ role: 'guest' }));
      setRole(session.role || 'guest');
      setRole(session.role || 'guest');
      setCurrentUser(session); // Contains id, groups, name, role
      // Check forced password change
      if (session.mustChangePassword) setMustChangePassword(true);
      else setMustChangePassword(false);

      // Check setup
      const setup = await apiFetch("/api/needs-setup").then(r => r.json()).catch(() => ({}));
      if (setup.needs_setup) {
        setNeedsSetup(true);
      }
    } catch (e) {
      console.error("Config load failed", e);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (presetName) => {
    const p = presets.find(x => x.name === presetName);
    if (!p) return;
    const { filters } = p;
    if (filters.status) setStatusFilter(filters.status);
    if (filters.periodicity) setPeriodFilter(filters.periodicity);
    if (filters.search !== undefined) setSearch(filters.search);

  };

  const fetchTasks = async () => {
    try {
      const q = new URLSearchParams({
        from,
        to,
        status: statusFilter === 'all' ? '' : statusFilter,
        search
      });
      const res = await apiFetch(`/api/instances?${q}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error("Fetch tasks error", e);
    }
  };

  const filteredTasks = React.useMemo(() => {
    return tasks.filter(t => {
      // Period filter
      if (periodFilter !== 'all' && t.periodicity !== periodFilter) return false;



      // My Tasks filter (for users and admins when enabled)
      if ((role === 'user' || role === 'admin') && showOnlyMyTasks && currentUser) {
        const myId = Number(currentUser.id);
        const myGroups = currentUser.groups || [];

        const assignedIds = (t.assigned_user_ids || []).map(Number);
        if (t.assigned_user_id) assignedIds.push(Number(t.assigned_user_id));

        const assignedGroups = [...(t.assigned_groups || [])];
        if (t.assigned_group && t.assigned_group !== 'all' && !assignedGroups.includes(t.assigned_group)) {
          assignedGroups.push(t.assigned_group);
        }

        const isUnassigned = assignedIds.length === 0 && assignedGroups.length === 0;
        const isAssignedUser = assignedIds.includes(myId);
        const isAssignedGroup = assignedGroups.some(g => myGroups.includes(g));

        // Only show if assigned to this user
        if (!isUnassigned && !isAssignedUser && !isAssignedGroup) return false;
      }

      return true;
    }).sort((a, b) => {
      const pOrder = { daily: 1, weekly: 2, monthly: 3, yearly: 4 };
      const pa = pOrder[a.periodicity] || 99;
      const pb = pOrder[b.periodicity] || 99;
      if (pa !== pb) return pa - pb;

      const da = a.start_ts || a.start_date || "";
      const db = b.start_ts || b.start_date || "";
      return da.localeCompare(db);
    });
  }, [tasks, periodFilter, showOnlyMyTasks, role, currentUser]);

  const handleLogout = () => {
    clearAuthToken();
    setRole("guest");
    setCurrentUser(null);
    fetchTasks();
  };

  const handleValidate = async (task) => {
    setActionDialog({ isOpen: true, type: 'validate', task });
  };

  const handleSetStatus = async (task, newStatus) => {
    if (newStatus === 'failed') {
      setActionDialog({ isOpen: true, type: 'fail', task });
    } else {
      // Direct update for other statuses not handled by specific dialogs
      // Currently only 'failed' needs comment. 'validated' goes through handleValidate.
      // Although handleSetStatus is called by TaskItem for 'failed', 
      // what if it's called for 'validated' directly? TaskItem calls 'onValidate' for validate.
      // So handleSetStatus mostly used for 'failed' or future statuses.
      // If it's just a direct status change, do it.
      performStatusUpdate(task, newStatus, "");
    }
  };

  const performStatusUpdate = async (task, newStatus, comment = "") => {
    await apiFetch(`/api/instances/set-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id || task._id || task.task_id,
        start_ts: task.start_ts || task.start_date,
        end_ts: task.end_ts || task.end_date,
        status: newStatus,
        comment
      })
    });
    fetchTasks();
  };

  const handleActionConfirm = (comment) => {
    const { type, task } = actionDialog;
    if (type === 'validate') {
      performStatusUpdate(task, 'validated', "");
    } else if (type === 'fail') {
      performStatusUpdate(task, 'failed', comment);
    }
    setActionDialog({ isOpen: false, type: null, task: null });
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  if (showDashboard) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 font-sans text-slate-900 dark:text-slate-50 transition-colors">
        <div className="container mx-auto max-w-7xl py-6 space-y-6">
          <DashboardPage
            lang={lang}
            onBack={() => setShowDashboard(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 font-sans text-slate-900 dark:text-slate-50 transition-colors">
      <div className="container mx-auto max-w-7xl py-6 space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            {cfg.logo_url && <img src={cfg.logo_url} alt="Logo" className="h-12 w-auto object-contain" />}
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent drop-shadow-sm self-end pb-1">
                {cfg.title}
              </h1>
              {cfg.subtitle && (
                <p className="text-lg md:text-xl font-heading font-medium text-slate-500 dark:text-slate-400 mt-1">
                  {cfg.subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role === 'guest' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLoginType('user')}>
                  <LogIn className="mr-2 h-4 w-4" /> {t(lang, 'login')}
                </Button>
              </>
            ) : (
              <>
                <span
                  className="text-sm font-medium mr-2 text-slate-600 dark:text-slate-300 cursor-help"
                  title={currentUser?.name || currentUser?.username || currentUser?.id || "Session"}
                >
                  {role === 'admin' ? 'Admin' : 'User'}
                </span>

                {role === 'admin' && (
                  <>
                    <>

                      <Button variant="outline" size="sm" onClick={() => setShowAdminTasks(true)}>
                        {t(lang, 'taskManagement')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
                        <Settings className="mr-2 h-4 w-4" /> {t(lang, 'btnParams')}
                      </Button>
                    </>
                  </>
                )}

                {(role === 'user' || role === 'admin') && (
                  <Button variant="ghost" size="sm" onClick={() => setShowDashboard(true)}>
                    <BarChart2 className="mr-2 h-4 w-4" /> {t(lang, 'dashboard') || "Dashboard"}
                  </Button>
                )}

                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" /> {t(lang, 'logout')}
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Filters */}
        <section className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'from')}</label>
              <DatePicker
                date={from}
                onDateChange={setFrom}
                lang={lang}
                placeholder={t(lang, 'from')}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'to')}</label>
              <DatePicker
                date={to}
                onDateChange={setTo}
                lang={lang}
                placeholder={t(lang, 'to')}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'choosePeriodicity')}</label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[115px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                  <SelectItem value="daily">{t(lang, 'daily')}</SelectItem>
                  <SelectItem value="weekly">{t(lang, 'weekly')}</SelectItem>
                  <SelectItem value="monthly">{t(lang, 'monthly')}</SelectItem>
                  <SelectItem value="yearly">{t(lang, 'yearly')}</SelectItem>
                  {String(cfg.feature_hno_enabled) === 'true' && (
                    <SelectItem value="hno">{t(lang, 'hno') || "HNO"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'status')}</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[115px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                  <SelectItem value="pending">{t(lang, 'pending')}</SelectItem>
                  <SelectItem value="validated">{t(lang, 'validated')}</SelectItem>
                  <SelectItem value="failed">{t(lang, 'failed')}</SelectItem>
                  <SelectItem value="missing">{t(lang, 'missing')}</SelectItem>
                </SelectContent>
              </Select>
            </div>





            <div className="flex-1 min-w-[150px] space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'search')}</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder={t(lang, 'searchPlaceholder')}
                  className="pl-8"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchTasks()}
                />
              </div>
            </div>

            {/* My Tasks Filter Toggle (User & Admin) */}
            {role !== 'guest' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'tasks')}</label>
                <div className="flex items-center h-10">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOnlyMyTasks(!showOnlyMyTasks)}
                    className={`h-10 min-w-[60px] font-semibold transition-all ${showOnlyMyTasks
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    {showOnlyMyTasks ? t(lang, 'solo') : t(lang, 'all')}
                  </Button>
                </div>
              </div>
            )}

            {/* Presets */}
            {presets.length > 0 && role === 'admin' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">
                  Filter
                </label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger className="w-[50px] px-2 flex justify-center">
                    <Bookmark className="h-4 w-4" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map(p => (
                      <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Single Export Button (Admin only) */}
            {role === 'admin' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Export</label>
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      className="bg-primary hover:bg-primary/90 text-white border-primary px-3 h-10"
                      title={t(lang, 'exportTitle') || "Export"}
                      onClick={() => setShowExportDialog(true)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
              </>
            )}

            <Button
              onClick={fetchTasks}
              className="bg-slate-300 hover:bg-slate-400 text-slate-900 border-0 px-3 h-10 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100"
              title={t(lang, 'refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Task List */}
        <main>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              {t(lang, 'none')}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map(task => (
                <TaskItem
                  key={task._id}
                  it={task}
                  lang={lang}
                  isAdmin={role === 'admin'}
                  isUser={role === 'user'}
                  currentUser={currentUser}
                  timeZone={COUNTRY_TIMEZONE?.[cfg.country] || "UTC"} // Access from constant directly if needed, or use util
                  onValidate={handleValidate}
                  onSetStatus={handleSetStatus}
                  onEdit={(task) => { setEditingTask(task); setShowEditTask(true); }}
                />
              ))}
            </div>
          )}
        </main>

        <LoginDialog
          isOpen={!!loginType}
          onClose={() => setLoginType(null)}
          type={loginType}
          lang={lang}
          appMode={cfg.app_mode || 'solo'}
          azureEnabled={!!cfg.auth_azure_enabled}
          onLoginSuccess={(newRole) => {
            setRole(newRole);
            loadConfig(); // Refresh config/session
            fetchTasks();
          }}
        />

        <AuthErrorDialog
          isOpen={!!authError}
          onClose={() => setAuthError(null)}
          message={authError}
        />

        <SetupDialog
          isOpen={needsSetup}
          onClose={() => setNeedsSetup(false)}
          lang={lang}
        />

        <SettingsDialog
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          lang={lang}
          onConfigChange={loadConfig}
        />

        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          lang={lang}
          from={from}
          to={to}
          status={statusFilter}
          periodicity={periodFilter}
          search={search}

        />

        <EditTaskDialog
          isOpen={showEditTask}
          onClose={() => setShowEditTask(false)}
          task={editingTask}
          lang={lang}
          onSaved={fetchTasks}
        />

        <AdminTasksDialog
          isOpen={showAdminTasks}
          onClose={() => setShowAdminTasks(false)}
          lang={lang}
          onTaskUpdated={fetchTasks}
          onConfigUpdate={loadConfig}
        />

        <PasswordChangeDialog
          isOpen={mustChangePassword}
          onClose={() => { }}
          isForced={true}
          lang={lang}
          title={t(lang, "passwordChangeRequired") || "Password Change Required"}
          onSave={async (pwd) => {
            try {
              const res = await apiFetch("/api/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pwd })
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed");
              }
              setMustChangePassword(false);
            } catch (e) {
              console.error(e);
              setPasswordChangeError(e.message);
            }
          }}
        />

        <TaskActionDialog
          isOpen={actionDialog.isOpen}
          onClose={() => setActionDialog({ ...actionDialog, isOpen: false })}
          type={actionDialog.type}
          onConfirm={handleActionConfirm}
          lang={lang}
        />

        <Toaster />

        {/* Password Change Error Dialog */}
        <AlertDialog open={!!passwordChangeError} onOpenChange={(open) => !open && setPasswordChangeError(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(lang, "error") || "Error"}</AlertDialogTitle>
              <AlertDialogDescription>
                {t(lang, "passwordChangeFailed") || "Failed to change password"}
                <br />
                <br />
                <strong>{passwordChangeError}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setPasswordChangeError(null)}>
                {t(lang, "close") || "Close"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div >
    </div >
  );
}

export default App;
