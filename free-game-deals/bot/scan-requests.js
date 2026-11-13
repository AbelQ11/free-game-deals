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
const { db, SCAN_COOLDOWN } = require('./context');
const { run_query, run_exec } = require('../lib/db');
const { scan_loop, is_scan_running } = require('./scan');
const {
    get_last_manual_scan_time,
    set_last_manual_scan_time,
} = require('./settings');
const {
    notify_owner,
    update_owner_notification,
    build_owner_scan_embed,
} = require('./owner');

function request_context(request) {
    return {
        user_tag: request.requested_by_tag || request.requested_by || 'dashboard',
        user_id: request.requested_by || 'dashboard',
        guild_name: request.guild_name || 'Dashboard',
        guild_id: request.guild_id || 'dashboard',
        channel_name: request.channel_name || 'Dashboard',
        channel_id: request.guild_id || 'dashboard',
    };
}

async function update_request(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;

    const assignments = keys.map((key) => `${key} = ?`).join(', ');
    await run_exec(
        db,
        `UPDATE scan_requests SET ${assignments} WHERE id = ?`,
        [...keys.map((key) => fields[key]), id]
    );
}

async function process_request(request) {
    if (is_scan_running()) return false;

    const now = Date.now();
    const last_manual_scan = await get_last_manual_scan_time();
    const time_left = last_manual_scan + SCAN_COOLDOWN - now;

    if (time_left > 0) {
        await update_request(request.id, {
            status: 'blocked',
            reason: 'cooldown',
            finished_at: new Date().toISOString(),
        });
        await notify_owner(
            build_owner_scan_embed(
                'blocked',
                'en',
                null,
                request_context(request),
                'ownerScanCooldown'
            )
        );
        return true;
    }

    await update_request(request.id, {
        status: 'running',
        started_at: new Date().toISOString(),
    });
    await set_last_manual_scan_time(now);

    const context = request_context(request);
    let notification = null;

    try {
        notification = await notify_owner(
            build_owner_scan_embed('started', 'en', null, context)
        );
        const summary = await scan_loop();

        await update_owner_notification(
            notification,
            build_owner_scan_embed('finished', 'en', summary, context)
        );
        await update_request(request.id, {
            status: 'done',
            result: JSON.stringify(summary),
            finished_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Dashboard scan request failed:', error);
        await update_owner_notification(
            notification,
            build_owner_scan_embed(
                'failed',
                'en',
                null,
                context,
                'scanError',
                error.message
            )
        );
        await update_request(request.id, {
            status: 'failed',
            reason: error.message,
            finished_at: new Date().toISOString(),
        });
    }

    return true;
}

async function process_pending_scan_requests() {
    if (is_scan_running()) return;

    const rows = await run_query(
        db,
        "SELECT * FROM scan_requests WHERE status = 'pending' ORDER BY id ASC LIMIT 1"
    );
    if (rows.length === 0) return;

    await process_request(rows[0]);
}

function start_scan_request_poller() {
    process_pending_scan_requests().catch((error) =>
        console.warn('Could not process scan requests:', error.message)
    );

    setInterval(() => {
        process_pending_scan_requests().catch((error) =>
            console.warn('Could not process scan requests:', error.message)
        );
    }, 5000);
}

module.exports = {
    process_pending_scan_requests,
    start_scan_request_poller,
};
