const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { open_database, ensure_schema, run_query } = require('../lib/db');

test('ensure_schema creates the dashboard tables and columns', async () => {
    const file = path.join(os.tmpdir(), `fgd-schema-${Date.now()}-${Math.random()}.db`);
    const db = open_database(file);

    try {
        await ensure_schema(db);

        const settings_columns = (
            await run_query(db, 'PRAGMA table_info(guild_settings)')
        ).map((column) => column.name);
        assert.ok(settings_columns.includes('channel_id'));

        const guild_columns = (await run_query(db, 'PRAGMA table_info(guilds)')).map(
            (column) => column.name
        );
        assert.ok(guild_columns.includes('channels'));

        const tables = (
            await run_query(db, "SELECT name FROM sqlite_master WHERE type = 'table'")
        ).map((table) => table.name);
        assert.ok(tables.includes('scan_requests'));
    } finally {
        await new Promise((resolve) => db.close(resolve));
        for (const suffix of ['', '-wal', '-shm']) {
            fs.rmSync(`${file}${suffix}`, { force: true });
        }
    }
});
