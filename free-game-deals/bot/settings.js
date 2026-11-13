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
const { client, db } = require('./context');
const { run_query, run_exec } = require('../lib/db');

async function get_meta_timestamp(key) {
    const rows = await run_query(
        db,
        'SELECT value FROM bot_meta WHERE key = ?',
        [key]
    );
    return rows.length > 0 ? Number.parseInt(rows[0].value, 10) || 0 : 0;
}

async function set_meta_timestamp(key, timestamp) {
    await run_exec(
        db,
        'INSERT OR REPLACE INTO bot_meta (key, value) VALUES (?, ?)',
        [key, String(timestamp)]
    );
}

function get_last_scan_time() {
    return get_meta_timestamp('last_scan_time');
}

function set_last_scan_time(timestamp) {
    return set_meta_timestamp('last_scan_time', timestamp);
}

// The manual cooldown is intentionally separate from automatic scans. An
// automatic scan must not block a manual /scan during the next 15 minutes.
function get_last_manual_scan_time() {
    return get_meta_timestamp('last_manual_scan_time');
}

function set_last_manual_scan_time(timestamp) {
    return set_meta_timestamp('last_manual_scan_time', timestamp);
}

async function update_guild_count() {
    await run_exec(
        db,
        "INSERT OR REPLACE INTO bot_meta (key, value) VALUES ('guild_count', ?)",
        [String(client.guilds.cache.size)]
    );
}

module.exports = {
    get_last_scan_time,
    set_last_scan_time,
    get_last_manual_scan_time,
    set_last_manual_scan_time,
    update_guild_count,
};
