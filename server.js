const express = require('express');
const path = require('path');
const { initDb } = require('./src/config/db');
const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve legacy public files if needed, or static assets
// Serve static files from React app
app.use(express.static(path.join(__dirname, 'client/dist')));

// Serve uploads specifically
app.use('/uploads', express.static(path.join(__dirname, 'client/public/uploads')));

// API Routes
app.use('/api', routes);

// SPA Fallback: Serve index.html for any unknown non-API route
app.get('*', (req, res, next) => {
    // If it's an API request that 404'd, let it fall through to error/404 handler if you prefer,
    // or just return index.html. usually specific check for /api.
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal Server Error', stack: err.stack });
});

const { reloadSchedulers } = require('./src/services/SchedulerService');

// Initialize DB and start server
initDb().then(async () => {
    // Start schedulers (cron jobs)
    await reloadSchedulers();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`API available at http://localhost:${PORT}/api`);
    });
}).catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
});
