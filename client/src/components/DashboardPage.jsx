import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/constants";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export function DashboardPage({ lang, onBack }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/dashboard/stats");
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            } else {
                setError("Failed to load dashboard data");
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // Auto-refresh every 5 minutes
        const interval = setInterval(fetchStats, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-rose-500">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                <h2 className="text-xl font-bold">Error loading dashboard</h2>
                <p>{error}</p>
                <Button variant="outline" className="mt-4" onClick={fetchStats}>Retry</Button>
            </div>
        );
    }

    // Colors
    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    const PIE_COLORS = { daily: '#3b82f6', weekly: '#8b5cf6', monthly: '#ec4899', yearly: '#f43f5e', hno: '#f59e0b' };

    return (
        <div className="space-y-6 container mx-auto p-6 max-w-7xl animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-4 mb-1">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t(lang, 'dashboard') || "Dashboard"}</h1>
                        {onBack && (
                            <Button variant="outline" size="sm" onClick={onBack}>
                                {t(lang, 'back') || "Back"}
                            </Button>
                        )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                        {t(lang, 'dashboardOverview') || "Overview of team performance and task health."}
                    </p>
                </div>
                <div className="text-sm text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {t(lang, 'lastUpdated') || "Last updated"}: {new Date().toLocaleTimeString()}
                </div>
            </div>

            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    lang={lang}
                    title={t(lang, "completionRate") || "Daily Completion"}
                    value={`${stats.daily.completionRate}%`}
                    icon={TrendingUp}
                    description={`${stats.daily.completed} / ${stats.daily.total} ${t(lang, 'tasksCompletedDesc') || "tasks completed"}`}
                    trend={stats.daily.completionRate >= 80 ? 'positive' : stats.daily.completionRate < 50 ? 'negative' : 'neutral'}
                />
                <StatCard
                    lang={lang}
                    title={t(lang, "pendingTasks") || "Pending Actions"}
                    value={stats.daily.pending}
                    icon={Clock}
                    description={t(lang, 'tasksWaitingDesc') || "Tasks waiting for validation"}
                    color="text-amber-500"
                />
                <StatCard
                    lang={lang}
                    title={t(lang, "missedTasks") || "Missed Today"}
                    value={stats.daily.missing + (stats.daily.failed || 0)}
                    icon={XCircle}
                    description={t(lang, 'tasksOverdueDesc') || "Tasks overdue"}
                    color="text-rose-500"
                />
                <StatCard
                    lang={lang}
                    title={t(lang, "onTime") || "On-Time Ratio"}
                    value={`${stats.daily.completed > 0 ? Math.round((stats.daily.onTime / stats.daily.completed) * 100) : 0}%`}
                    icon={CheckCircle2}
                    description={t(lang, 'ofCompletedTasksDesc') || "Of completed tasks"}
                    color="text-emerald-500"
                />
            </div>

            {/* Graphic Section */}
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">

                {/* Weekly Trend Chart */}
                <Card className="col-span-1 lg:col-span-4 shadow-sm border-slate-200 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle>{t(lang, 'weeklyActivity') || "Weekly Activity"}</CardTitle>
                        <CardDescription>{t(lang, 'weeklyActivityDesc') || "Task Statuses"}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={stats.trend}>
                                <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    cursor={{ fill: 'transparent' }}
                                />
                                <Bar dataKey="completed" fill="#10b981" radius={[0, 0, 4, 4]} name="Completed" stackId="a" />
                                <Bar dataKey="pending" fill="#fbbf24" radius={[0, 0, 0, 0]} name="Pending" stackId="a" />
                                <Bar dataKey="missed" fill="#94a3b8" radius={[0, 0, 0, 0]} name="Missed" stackId="a" />
                                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} name="Failed" stackId="a" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Urgent Pending Tasks (Moved here) */}
                <Card className="col-span-1 lg:col-span-3 shadow-sm border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-900/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="h-5 w-5" />
                            {t(lang, 'urgentPendingTasks') || "Urgent Pending Tasks"}
                        </CardTitle>
                        <CardDescription>{t(lang, 'urgentTasksDesc') || "Listing tasks ending soon"}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {stats.atRisk.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-500 opacity-50" />
                                <p>{t(lang, 'noRisks') || "No immediate risks found. Good job!"}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stats.atRisk.map((task) => (
                                    <div key={`${task.task_id}-${task.start_ts}`} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-rose-100 dark:border-rose-900/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Badge variant="outline" className={`shrink-0 ${task.periodicity === 'daily' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-slate-200'}`}>
                                                {task.periodicity}
                                            </Badge>
                                            <div className="min-w-0">
                                                <p className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm" title={task.description}>{task.description}</p>
                                                <p className="text-xs text-slate-500">Ends at {new Date(task.end_ts).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <Badge variant="destructive" className="animate-pulse whitespace-nowrap">
                                                {task.remainingMinutes} min
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatCard({ lang, title, value, icon: Icon, description, trend, color = "text-slate-900 dark:text-white" }) {
    return (
        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {description}
                </p>
                {trend && (
                    <div className={`text-xs mt-2 font-medium ${trend === 'positive' ? 'text-emerald-600' : trend === 'negative' ? 'text-rose-600' : 'text-slate-500'}`}>
                        {trend === 'positive' ? (t(lang, 'trendHigh') || 'High Performance') : trend === 'negative' ? (t(lang, 'trendAttention') || 'Needs Attention') : (t(lang, 'trendStable') || 'Stable')}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
