const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        // Fallback to valid-looking dummy for build time, real env for runtime
        url: process.env.DATABASE_URL || "postgresql://build:build@localhost:5432/build",
    },
});
