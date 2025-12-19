import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskItem } from "@/components/TaskItem";
import { LoginDialog } from "@/components/LoginDialog";
import { SetupDialog } from "@/components/SetupDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { EditTaskDialog } from "@/components/EditTaskDialog";
import { AdminTasksDialog } from "@/components/AdminTasksDialog";
import { t, I18N, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { apiFetch, clearAuthToken, downloadWithAuth } from "@/lib/api";
import { isoYMD, endOfMonthYMD } from "@/lib/utils";
import { applyTheme } from "@/lib/themes";
import { LogIn, LogOut, Settings, RefreshCw, Search, FileSpreadsheet, FileText } from 'lucide-react';
import { DatePicker } from "@/components/DatePicker";
import { Toaster } from "@/components/ui/toaster";

import { TaskActionDialog } from "@/components/TaskActionDialog";

function App() {
  // Config & Session
  const [cfg, setCfg] = useState({ lang: "EN", country: "FR", title: "Taskmaster" });
  const [role, setRole] = useState("guest"); // guest | user | admin
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
  const [search, setSearch] = useState("");

  // Modals
  const [loginType, setLoginType] = useState(null); // 'user' | 'admin' | null
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdminTasks, setShowAdminTasks] = useState(false);
  const [showEditTask, setShowEditTask] = useState(false);
  const [editingTask, setEditingTask] = useState(null); // null = create new

  // Action Dialog
  const [actionDialog, setActionDialog] = useState({ isOpen: false, type: null, task: null });

  // Initial Load
  useEffect(() => {
    loadConfig();
  }, []);

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

  // Reload tasks when filters or role change (immediate)
  useEffect(() => {
    if (!loading) fetchTasks();
  }, [from, to, statusFilter, role, loading]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loading) fetchTasks();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadConfig = async () => {
    try {
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
      const session = await apiFetch("/api/session").then(r => r.json()).catch(() => ({ role: 'guest' }));
      setRole(session.role || 'guest');

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

  const handleLogout = () => {
    clearAuthToken();
    setRole("guest");
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
                  <LogIn className="mr-2 h-4 w-4" /> {t(lang, 'btnLoginUser')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoginType('admin')}
                  className="bg-slate-900 text-slate-50 hover:bg-slate-800 hover:text-slate-50 border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  <LogIn className="mr-2 h-4 w-4" /> Admin sign-in
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium mr-2 text-slate-600 dark:text-slate-300">
                  {role === 'admin' ? 'Admin' : 'User'}
                </span>

                {role === 'admin' && (
                  <>
                    <>
                      <Button variant="default" size="sm" onClick={() => { setEditingTask(null); setShowEditTask(true); }}>
                        + {t(lang, 'create')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowAdminTasks(true)}>
                        {t(lang, 'taskManagement')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
                        <Settings className="mr-2 h-4 w-4" /> {t(lang, 'btnParams')}
                      </Button>
                    </>
                  </>
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
              <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'status')}</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
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

            <div className="flex-1 min-w-[200px] space-y-1">
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

            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">{t(lang, 'exportLabel')}</label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:border-emerald-700 px-3 h-10"
                    title={t(lang, 'exportCSV')}
                    onClick={() => {
                      const q = new URLSearchParams({ from, to });
                      downloadWithAuth(`/api/export.csv?${q}`, `export_${from}_${to}.csv`);
                    }}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600 hover:border-rose-700 px-3 h-10"
                    title={t(lang, 'exportPDF')}
                    onClick={() => {
                      const q = new URLSearchParams({ from, to });
                      downloadWithAuth(`/api/export.pdf?${q}`, `export_${from}_${to}.pdf`);
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

              <Button
                onClick={fetchTasks}
                className="bg-slate-300 hover:bg-slate-400 text-slate-900 border-0 px-3 h-10 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100"
                title={t(lang, 'refresh')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* Task List */}
        <main>
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              {t(lang, 'none')}
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => (
                <TaskItem
                  key={task._id}
                  it={task}
                  lang={lang}
                  isAdmin={role === 'admin'}
                  isUser={role === 'user'}
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
          onLoginSuccess={(newRole) => {
            setRole(newRole);
            loadConfig(); // Refresh config/session
            fetchTasks();
          }}
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
        />

        <TaskActionDialog
          isOpen={actionDialog.isOpen}
          onClose={() => setActionDialog({ ...actionDialog, isOpen: false })}
          type={actionDialog.type}
          onConfirm={handleActionConfirm}
          lang={lang}
        />

        <Toaster />
      </div>
    </div>
  );
}

export default App;
