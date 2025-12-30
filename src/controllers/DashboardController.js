const { getConfig } = require("../models/Config");
const { buildInstances } = require("../services/InstanceService");
const { getStatuses } = require("../models/Status");
const { getTasks } = require("../models/Task");
const { addDaysYMD, ymdFromDateInTZ, getTimeZoneForCountry } = require("../utils/time");

async function getDashboardStats(req, res) {
    try {
        const config = await getConfig();
        const tz = getTimeZoneForCountry(config.country || "FR");
        const today = ymdFromDateInTZ(new Date(), tz);

        // 1. Daily Stats (Today)
        const todayStr = `${today.y}-${String(today.m).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;

        const instancesToday = await buildInstances(
            { from: todayStr, to: todayStr, includeFuture: true }, // Include future so logic works for tasks starting later today
            config.country || "FR"
        );

        const now = new Date();
        const nowMs = now.getTime();

        const total = instancesToday.length;
        const completed = instancesToday.filter(i => i.status === 'validated').length;
        const pending = instancesToday.filter(i => i.status === 'pending' && new Date(i.start_ts) <= now).length;
        const missing = instancesToday.filter(i => i.status === 'missing').length;
        const failed = instancesToday.filter(i => i.status === 'failed').length;

        // Simple on-time logic
        const onTime = instancesToday.filter(i => i.status === 'validated' && i.comment !== 'late').length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const dailyStats = { total, completed, pending, missing, failed, onTime, completionRate };

        // 2. Weekly Trend (Last 7 days INCLUDING today)
        const sevenDaysAgo = addDaysYMD(today, -6);
        const sevenDaysAgoStr = `${sevenDaysAgo.y}-${String(sevenDaysAgo.m).padStart(2, '0')}-${String(sevenDaysAgo.d).padStart(2, '0')}`;

        const instancesWeek = await buildInstances(
            { from: sevenDaysAgoStr, to: todayStr, includeFuture: true },
            config.country || "FR"
        );

        // Group by day
        // "MM-DD" as key
        const trendMap = {};
        instancesWeek.forEach(i => {
            const dayKey = i.start_ts.split('T')[0]; // simple YYYY-MM-DD
            if (!trendMap[dayKey]) trendMap[dayKey] = { date: dayKey, completed: 0, missed: 0, pending: 0, failed: 0, total: 0 };

            trendMap[dayKey].total++;
            if (i.status === 'validated') trendMap[dayKey].completed++;
            else if (i.status === 'missing') trendMap[dayKey].missed++;
            else if (i.status === 'failed') trendMap[dayKey].failed++;
            else trendMap[dayKey].pending++;
        });

        const weeklyTrend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

        // 3. At Risk Tasks (Future but pending, ending soon)
        // We need to look ahead slightly or just check pending tasks from Today's list that are close to deadline.
        // We already have 'instancesToday'. Filtering those pending
        const atRisk = instancesToday
            .filter(i => i.status === 'pending')
            .map(i => {
                const endMs = new Date(i.end_ts).getTime();
                const diffMin = Math.round((endMs - nowMs) / 60000);
                return { ...i, remainingMinutes: diffMin };
            })
            .filter(i => i.remainingMinutes > 0 && i.remainingMinutes < 180) // Ending in next 3 hours
            .sort((a, b) => a.remainingMinutes - b.remainingMinutes)
            .slice(0, 5); // Top 5

        // Distributions (By Technician / Assigned User)
        const distribution = {};
        instancesWeek.forEach(i => {
            const users = i.assigned_usernames && i.assigned_usernames.length > 0 ? i.assigned_usernames : ["Unassigned"];
            users.forEach(u => {
                if (!distribution[u]) distribution[u] = 0;
                distribution[u]++;
            });
        });
        const distData = Object.keys(distribution)
            .map(k => ({ name: k, value: distribution[k] }))
            .sort((a, b) => b.value - a.value) // Sort by most busy
            .slice(0, 10); // Top 10 only if many users

        res.json({
            daily: { ...dailyStats, completionRate },
            trend: weeklyTrend,
            atRisk,
            distribution: distData
        });

    } catch (e) {
        console.error("Dashboard Stats Error:", e);
        res.status(500).json({ error: "Failed to load dashboard stats" });
    }
}

module.exports = {
    getDashboardStats
};
