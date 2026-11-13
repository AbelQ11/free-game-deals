/*
 * Free Game Deals Bot
 * Copyright (C) 2026 Daith_42 & Kiliotsu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const sqlite3 = require('sqlite3').verbose();

/**
 * Open a SQLite database with settings that are safe for two processes
 * (the bot and the website) using the same file at the same time.
 */
function open_database(db_path) {
    const db = new sqlite3.Database(db_path, (err) => {
        if (err) console.error('Database connection error:', err.message);
    });

    db.configure('busyTimeout', 5000);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA foreign_keys = ON');

    return db;
}

function run_query(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function run_get(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function run_exec(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

async function ensure_schema(db) {
    await run_exec(db, `
        CREATE TABLE IF NOT EXISTS sent_deals (
            id TEXT PRIMARY KEY,
            title TEXT,
            thumb TEXT,
            link TEXT,
            description TEXT,
            date TEXT,
            end_date TEXT,
            store TEXT,
            notified INTEGER DEFAULT 0
        )
    `);

    await run_exec(db, `
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            language TEXT DEFAULT 'en',
            ping_role TEXT DEFAULT 'everyone',
            steam_on INTEGER DEFAULT 1,
            epic_on INTEGER DEFAULT 1,
            gog_on INTEGER DEFAULT 1
        )
    `);

    await run_exec(db, `
        CREATE TABLE IF NOT EXISTS guilds (
            guild_id TEXT PRIMARY KEY,
            name TEXT,
            icon TEXT,
            owner_id TEXT,
            roles TEXT,
            updated_at TEXT
        )
    `);

    await run_exec(db, `
        CREATE TABLE IF NOT EXISTS bot_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);

    await run_exec(db, `
        CREATE TABLE IF NOT EXISTS deal_messages (
            deal_id TEXT,
            channel_id TEXT,
            message_id TEXT,
            PRIMARY KEY(deal_id, channel_id, message_id)
        )
    `);

    // Migrate databases created by older versions of the bot.
    const columns = await run_query(db, 'PRAGMA table_info(sent_deals)');
    const names = new Set(columns.map((column) => column.name));

    if (!names.has('description')) {
        await run_exec(db, 'ALTER TABLE sent_deals ADD COLUMN description TEXT');
    }
    if (!names.has('store')) {
        try {
            await run_exec(db, 'ALTER TABLE sent_deals ADD COLUMN store TEXT');
        } catch (error) {
            if (!/duplicate column name/i.test(error.message)) throw error;
        }
    }
    if (!names.has('notified')) {
        try {
            await run_exec(db, 'ALTER TABLE sent_deals ADD COLUMN notified INTEGER DEFAULT 0');
            // Every row that existed before this migration was already announced.
            await run_exec(db, 'UPDATE sent_deals SET notified = 1');
        } catch (error) {
            if (!/duplicate column name/i.test(error.message)) throw error;
        }
    }

    await run_exec(db, `
        UPDATE sent_deals
        SET store = CASE
            WHEN substr(id, 1, 5) = 'epic_' THEN 'Epic Games'
            WHEN substr(id, 1, 4) = 'gog_' THEN 'GOG'
            ELSE 'Steam'
        END
        WHERE store IS NULL
    `);

    // Deals that already existed before this migration were already announced.
    await run_exec(db, 'UPDATE sent_deals SET notified = 1 WHERE notified IS NULL');

    // Normalize legacy empty/"null" end dates so active/expired checks are consistent.
    await run_exec(
        db,
        "UPDATE sent_deals SET end_date = NULL WHERE end_date = '' OR end_date = 'null'"
    );

    await run_exec(db, 'CREATE INDEX IF NOT EXISTS idx_sent_deals_date ON sent_deals(date DESC)');
    await run_exec(db, 'CREATE INDEX IF NOT EXISTS idx_sent_deals_store ON sent_deals(store)');
    await run_exec(db, 'CREATE INDEX IF NOT EXISTS idx_sent_deals_notified ON sent_deals(notified)');
    await run_exec(db, 'CREATE INDEX IF NOT EXISTS idx_deal_messages_deal ON deal_messages(deal_id)');
    await run_exec(db, 'CREATE INDEX IF NOT EXISTS idx_guilds_updated ON guilds(updated_at)');
}

module.exports = {
    open_database,
    ensure_schema,
    run_query,
    run_get,
    run_exec,
};
