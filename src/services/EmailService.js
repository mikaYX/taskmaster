const nodemailer = require("nodemailer");
const { getConfig } = require("../models/Config");
const { getUsers } = require("../models/User");

async function createTransporter(config) {
    const cfg = config || await getConfig();

    if (!cfg.mail_enabled) return null;

    const port = parseInt(cfg.smtp_port) || 587;
    // Fix for "wrong version number": Don't use secure:true on 587/25.
    // secure:true means connection is SSL from the start (Implicit TLS), usually port 465.
    // Port 587 uses STARTTLS (Explicit TLS) which Nodemailer handles automatically when secure:false.
    const isSecure = port === 465 || (port !== 587 && port !== 25 && (cfg.smtp_secure === true || cfg.smtp_secure === '1'));

    return nodemailer.createTransport({
        host: cfg.smtp_host,
        port: port,
        secure: isSecure,
        auth: {
            user: cfg.smtp_user,
            pass: cfg.smtp_pass
        },
        tls: {
            // Setup for STARTTLS
            ciphers: 'SSLv3'
        }
    });
}

function buildEmailTemplate(title, content, footerText = "") {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <!-- Header -->
        <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${title}</h1>
            </td>
        </tr>
        
        <!-- Content -->
        <tr>
            <td style="padding: 40px 30px;">
                ${content}
            </td>
        </tr>
        
        <!-- Footer -->
        <tr>
            <td style="background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                <p style="margin: 0; color: #6c757d; font-size: 14px; line-height: 1.6;">
                    ${footerText || 'Taskmaster - Automated Task Management System'}
                </p>
                <p style="margin: 10px 0 0 0; color: #adb5bd; font-size: 12px;">
                    This is an automated message. Please do not reply.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function buildMissingTasksEmail(tasks, config) {
    const taskRows = tasks.map(task => `
        <tr style="border-bottom: 1px solid #e9ecef;">
            <td style="padding: 20px 15px;">
                <div style="margin-bottom: 8px;">
                    <strong style="color: #212529; font-size: 16px;">${task.description}</strong>
                    <span style="display: inline-block; margin-left: 10px; padding: 4px 12px; background: #dc3545; color: white; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">Missing</span>
                </div>
                <div style="color: #6c757d; font-size: 14px; margin-bottom: 8px;">
                    <span style="display: inline-block; margin-right: 20px;">📅 Period: <strong>${task.periodicity}</strong></span>
                    <span style="display: inline-block;">⏰ Due: <strong>${new Date(task.end_ts).toLocaleString()}</strong></span>
                </div>
                ${task.procedure_url ? `
                <div style="margin-top: 12px;">
                    <a href="${task.procedure_url}" style="display: inline-block; padding: 8px 16px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">📋 View Procedure</a>
                </div>
                ` : ''}
                ${task.assigned_usernames && task.assigned_usernames.length > 0 ? `
                <div style="margin-top: 12px; color: #495057; font-size: 13px;">
                    👤 Assigned to: <strong>${task.assigned_usernames.join(', ')}</strong>
                </div>
                ` : ''}
            </td>
        </tr>
    `).join('');

    const content = `
        <div style="margin-bottom: 30px;">
            <p style="margin: 0 0 20px 0; color: #495057; font-size: 16px; line-height: 1.6;">
                The following tasks have not been completed and are now marked as <strong style="color: #dc3545;">missing</strong>:
            </p>
        </div>
        
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border: 1px solid #e9ecef; border-radius: 8px; overflow: hidden;">
            ${taskRows}
        </table>
        
        <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 6px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
                ⚠️ <strong>Action required:</strong> Please review and complete these tasks as soon as possible.
            </p>
        </div>
    `;

    return buildEmailTemplate('⚠️ Missing Tasks Alert', content, config?.title || 'Taskmaster');
}

function buildReminderEmail(task, config) {
    const startTime = new Date(task.start_ts).toLocaleString();
    const endTime = new Date(task.end_ts).toLocaleString();

    const h = (typeof config.mail_reminder_offset_hours !== 'undefined') ? config.mail_reminder_offset_hours : 1;
    const m = (typeof config.mail_reminder_offset_minutes !== 'undefined') ? config.mail_reminder_offset_minutes : 0;

    let timeLabel = "";
    if (h > 0) timeLabel += `${h} hour${h > 1 ? 's' : ''}`;
    if (m > 0) timeLabel += `${h > 0 ? ' ' : ''}${m} minute${m > 1 ? 's' : ''}`;
    if (!timeLabel) timeLabel = "soon";

    const content = `
        <div style="margin-bottom: 30px; text-align: center;">
            <div style="display: inline-block; padding: 15px 30px; background: #fff3cd; border-radius: 12px; margin-bottom: 20px;">
                <p style="margin: 0; color: #856404; font-size: 18px; font-weight: 600;">
                    ⏰ Task ending in ${timeLabel}
                </p>
            </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 8px; border-left: 4px solid #667eea;">
            <h2 style="margin: 0 0 20px 0; color: #212529; font-size: 20px;">${task.description}</h2>
            
            <div style="margin-bottom: 15px;">
                <span style="display: inline-block; padding: 6px 14px; background: ${getPeriodicityColor(task.periodicity)}; color: white; border-radius: 20px; font-size: 13px; font-weight: 600; text-transform: capitalize;">
                    ${task.periodicity}
                </span>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                <p style="margin: 0 0 10px 0; color: #495057; font-size: 14px;">
                    <strong>Start:</strong> ${startTime}
                </p>
                <p style="margin: 0 0 10px 0; color: #495057; font-size: 14px;">
                    <strong>End:</strong> ${endTime}
                </p>
                ${task.assigned_usernames && task.assigned_usernames.length > 0 ? `
                <p style="margin: 0; color: #495057; font-size: 14px;">
                    <strong>Assigned to:</strong> ${task.assigned_usernames.join(', ')}
                </p>
                ` : ''}
            </div>
            
            ${task.procedure_url ? `
            <div style="margin-top: 25px; text-align: center;">
                <a href="${task.procedure_url}" style="display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                    📋 View Procedure
                </a>
            </div>
            ` : ''}
        </div>
        
        <div style="margin-top: 30px; padding: 20px; background: #d1ecf1; border-left: 4px solid #0c5460; border-radius: 6px;">
            <p style="margin: 0; color: #0c5460; font-size: 14px;">
                💡 <strong>Reminder:</strong> This task ends at ${endTime}. Please ensure it is validated.
            </p>
        </div>
    `;

    return buildEmailTemplate('🔔 Task Reminder', content, config?.title || 'Taskmaster');
}

function getPeriodicityColor(periodicity) {
    const colors = {
        daily: '#007bff',
        weekly: '#6f42c1',
        monthly: '#fd7e14',
        yearly: '#dc3545',
        hno: '#ffc107'
    };
    return colors[periodicity] || '#6c757d';
}

async function getEmailRecipients(task, config, specificConfigKey = null) {
    const recipients = [];

    const recipientConfig = specificConfigKey ? config[specificConfigKey] : (config.mail_missing_recipients || config.mail_reminder_recipients);

    if (!recipientConfig || (Array.isArray(recipientConfig) && recipientConfig.length === 0)) {
        // Default fallback to mail_to
        if (config.mail_to) {
            return config.mail_to.split(',').map(e => e.trim()).filter(e => e);
        }
        return [];
    }

    // Admin emails
    if (recipientConfig.includes('admin')) {
        const users = await getUsers();
        const admins = users.filter(u => u.role === 'admin' && u.email);
        recipients.push(...admins.map(a => a.email));
    }

    // Custom emails
    if (recipientConfig.includes('custom') && config.mail_custom_emails) {
        const customEmails = config.mail_custom_emails.split(',').map(e => e.trim()).filter(e => e);
        recipients.push(...customEmails);
    }

    // Assigned users (including delegations)
    if (recipientConfig.includes('assigned') && task) {
        if (task.assigned_user_ids && task.assigned_user_ids.length > 0) {
            const users = await getUsers();
            const assignedUsers = users.filter(u => task.assigned_user_ids.includes(u.id) && u.email);
            recipients.push(...assignedUsers.map(u => u.email));
        }
    }

    // Remove duplicates
    return [...new Set(recipients)];
}

async function sendMissingTasksEmail(tasks) {
    try {
        const config = await getConfig();

        if (!config.mail_enabled || !config.mail_missing_enabled) {
            return { ok: false, reason: 'Email or missing alerts not enabled' };
        }

        const transporter = await createTransporter(config);
        if (!transporter) {
            return { ok: false, reason: 'Failed to create email transporter' };
        }

        const recipients = await getEmailRecipients(null, config);
        if (recipients.length === 0) {
            return { ok: false, reason: 'No recipients configured' };
        }

        const html = buildMissingTasksEmail(tasks, config);

        await transporter.sendMail({
            from: config.mail_from,
            to: recipients.join(', '),
            subject: `⚠️ ${tasks.length} Missing Task${tasks.length > 1 ? 's' : ''} - ${config.title || 'Taskmaster'}`,
            html
        });

        return { ok: true, count: tasks.length, recipients: recipients.length };
    } catch (error) {
        console.error('sendMissingTasksEmail error:', error);
        return { ok: false, error: error.message };
    }
}

async function sendReminderEmail(task) {
    try {
        const config = await getConfig();

        if (!config.mail_enabled || !config.mail_reminder_enabled) {
            return { ok: false, reason: 'Email or reminders not enabled' };
        }

        const transporter = await createTransporter(config);
        if (!transporter) {
            return { ok: false, reason: 'Failed to create email transporter' };
        }

        const recipients = await getEmailRecipients(task, config);
        if (recipients.length === 0) {
            return { ok: false, reason: 'No recipients configured' };
        }

        const html = buildReminderEmail(task, config);

        await transporter.sendMail({
            from: config.mail_from,
            to: recipients.join(', '),
            subject: `🔔 Reminder: ${task.description} - ${config.title || 'Taskmaster'}`,
            html
        });

        return { ok: true, recipients: recipients.length };
    } catch (error) {
        console.error('sendReminderEmail error:', error);
        return { ok: false, error: error.message };
    }
}

module.exports = {
    createTransporter,
    sendMissingTasksEmail,
    sendReminderEmail,
    getEmailRecipients,
    buildEmailTemplate
};
