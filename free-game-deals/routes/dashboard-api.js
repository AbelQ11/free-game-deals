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
const crypto = require('crypto');

const {
    SUPPORTED_LANGS,
    MANUAL_SCAN_COOLDOWN,
    ACTIVE_DEALS_WHERE,
} = require('../lib/config');

const OWNER_ID = /^\d+$/.test(process.env.OWNER_ID || '') ? process.env.OWNER_ID : null;

const DEFAULT_SETTINGS = {
    language: 'en',
    ping_role: 'everyone',
    steam_on: 1,
    epic_on: 1,
    gog_on: 1,
    channel_id: null,
};

function get_csrf_token(req) {
    if (!req.session.csrf_token) {
        req.session.csrf_token = crypto.randomBytes(32).toString('hex');
    }
    return req.session.csrf_token;
}

function require_auth(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

function manageable_guild_map(req) {
    const guilds = Array.isArray(req.user?.guilds) ? req.user.guilds : [];
    return new Map(guilds.map((guild) => [String(guild.id), guild]));
}

function parse_roles(value) {
    if (!value) return [];
    try {
        const roles = JSON.parse(value);
        if (!Array.isArray(roles)) return [];
        return roles
            .filter((role) => role && role.id)
            .map((role) => ({
                id: String(role.id),
                name: String(role.name || 'Role').slice(0, 100),
            }));
    } catch (_) {
        return [];
    }
}

function parse_channels(value) {
    if (!value) return [];
    try {
        const channels = JSON.parse(value);
        if (!Array.isArray(channels)) return [];
        return channels
            .filter((channel) => channel && channel.id)
            .map((channel) => ({
                id: String(channel.id),
                name: String(channel.name || 'Channel').slice(0, 100),
            }));
    } catch (_) {
        return [];
    }
}

function parse_json(value) {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

function normalize_settings(row) {
    return {
        language: SUPPORTED_LANGS.includes(row?.language)
            ? row.language
            : DEFAULT_SETTINGS.language,
        ping_role: row?.ping_role ? String(row.ping_role) : DEFAULT_SETTINGS.ping_role,
        steam_on: row?.steam_on === 0 || row?.steam_on === '0' ? 0 : 1,
        epic_on: row?.epic_on === 0 || row?.epic_on === '0' ? 0 : 1,
        gog_on: row?.gog_on === 0 || row?.gog_on === '0' ? 0 : 1,
        channel_id: row?.channel_id ? String(row.channel_id) : null,
    };
}

function get_meta_value(rows, key) {
    const row = rows.find((item) => item.key === key);
    return row ? row.value : null;
}

function register_dashboard_api(app, { db, run_query, run_exec }) {
    app.get('/api/dashboard', require_auth, async (req, res) => {
        res.set('Cache-Control', 'no-store');

        const manageable = manageable_guild_map(req);
        if (manageable.size === 0) {
            return res.status(403).json({
                error: 'No manageable servers. Reconnect with Discord to refresh permissions.',
                reauth: true,
            });
        }

        try {
            const [guild_rows, settings_rows] = await Promise.all([
                run_query(db, 'SELECT guild_id, name, icon, roles, channels FROM guilds'),
                run_query(db, 'SELECT * FROM guild_settings'),
            ]);

            const guild_map = new Map(
                guild_rows.map((row) => [String(row.guild_id), row])
            );
            const settings_map = new Map(
                settings_rows.map((row) => [String(row.guild_id), row])
            );

            const candidate_ids = new Set([
                ...guild_map.keys(),
                ...settings_map.keys(),
            ]);

            const guilds = [];
            for (const [id, user_guild] of manageable) {
                if (!candidate_ids.has(id)) continue;

                const guild_row = guild_map.get(id);
                const settings_row = settings_map.get(id);

                guilds.push({
                    id,
                    name: guild_row?.name || user_guild.name || 'Discord server',
                    icon: guild_row?.icon || user_guild.icon || null,
                    owner: Boolean(user_guild.owner),
                    roles: parse_roles(guild_row?.roles),
                    channels: parse_channels(guild_row?.channels),
                    settings: normalize_settings(settings_row),
                });
            }

            guilds.sort((a, b) => a.name.localeCompare(b.name));
            res.json({
                csrf_token: get_csrf_token(req),
                guilds,
            });
        } catch (error) {
            console.error('Dashboard data error:', error.message);
            res.status(500).json({ error: 'Unable to load dashboard data' });
        }
    });

    app.get('/api/dashboard/status', require_auth, async (req, res) => {
        res.set('Cache-Control', 'no-store');

        try {
            const now = Date.now();
            const [meta_rows, active_games, total_games, latest_requests] =
                await Promise.all([
                    run_query(
                        db,
                        `SELECT key, value FROM bot_meta
                         WHERE key IN ('last_scan_time', 'last_manual_scan_time',
                                       'scan_in_progress', 'last_scan_summary')`
                    ),
                    run_query(
                        db,
                        `SELECT COUNT(*) AS count FROM sent_deals
                         WHERE ${ACTIVE_DEALS_WHERE}`,
                        [Math.floor(now / 1000)]
                    ),
                    run_query(db, 'SELECT COUNT(*) AS count FROM sent_deals'),
                    run_query(
                        db,
                        `SELECT id, requested_by, requested_by_tag, guild_id, guild_name,
                                channel_name, status, reason, result, created_at,
                                started_at, finished_at
                         FROM scan_requests
                         ORDER BY id DESC
                         LIMIT 1`
                    ),
                ]);

            const last_scan_at = Number.parseInt(
                get_meta_value(meta_rows, 'last_scan_time'),
                10
            ) || 0;
            const last_manual_scan_at = Number.parseInt(
                get_meta_value(meta_rows, 'last_manual_scan_time'),
                10
            ) || 0;
            const cooldown_remaining_ms = Math.max(
                0,
                last_manual_scan_at + MANUAL_SCAN_COOLDOWN - now
            );

            const latest_request = latest_requests[0]
                ? {
                      id: latest_requests[0].id,
                      requested_by: latest_requests[0].requested_by,
                      requested_by_tag: latest_requests[0].requested_by_tag,
                      guild_id: latest_requests[0].guild_id,
                      guild_name: latest_requests[0].guild_name,
                      channel_name: latest_requests[0].channel_name,
                      status: latest_requests[0].status,
                      reason: latest_requests[0].reason,
                      result: parse_json(latest_requests[0].result),
                      created_at: latest_requests[0].created_at,
                      started_at: latest_requests[0].started_at,
                      finished_at: latest_requests[0].finished_at,
                  }
                : null;

            res.json({
                can_scan: Boolean(OWNER_ID && String(req.user.id) === OWNER_ID),
                scan_in_progress: get_meta_value(meta_rows, 'scan_in_progress') === '1',
                cooldown_remaining_ms,
                last_scan_at,
                last_manual_scan_at,
                last_scan: parse_json(get_meta_value(meta_rows, 'last_scan_summary')),
                latest_request,
                active_games: Number(active_games[0]?.count) || 0,
                total_games: Number(total_games[0]?.count) || 0,
                updated_at: new Date().toISOString(),
            });
        } catch (error) {
            console.error('Dashboard status error:', error.message);
            res.status(500).json({ error: 'Unable to load the bot status' });
        }
    });

    app.post('/api/dashboard/scan', require_auth, async (req, res) => {
        const csrf_token = req.get('x-csrf-token');
        if (!csrf_token || csrf_token !== req.session.csrf_token) {
            return res.status(403).json({ error: 'Invalid CSRF token' });
        }

        if (!OWNER_ID || String(req.user.id) !== OWNER_ID) {
            return res.status(403).json({ error: 'Only the bot owner can start a scan' });
        }

        try {
            const [meta_rows, latest_pending] = await Promise.all([
                run_query(
                    db,
                    `SELECT key, value FROM bot_meta
                     WHERE key IN ('last_manual_scan_time', 'scan_in_progress')`
                ),
                run_query(
                    db,
                    `SELECT COUNT(*) AS count FROM scan_requests
                     WHERE status IN ('pending', 'running')`
                ),
            ]);

            if (get_meta_value(meta_rows, 'scan_in_progress') === '1') {
                return res.status(409).json({ error: 'scan_in_progress' });
            }

            if (Number(latest_pending[0]?.count) > 0) {
                return res.status(409).json({ error: 'scan_queued' });
            }

            const now = Date.now();
            const last_manual_scan =
                Number.parseInt(get_meta_value(meta_rows, 'last_manual_scan_time'), 10) || 0;
            const remaining = last_manual_scan + MANUAL_SCAN_COOLDOWN - now;
            if (remaining > 0) {
                return res.status(429).json({
                    error: 'cooldown',
                    retry_after_ms: remaining,
                });
            }

            const guild_id = req.body?.guild_id ? String(req.body.guild_id) : null;
            let guild_name = null;
            if (guild_id) {
                const manageable = manageable_guild_map(req);
                if (!manageable.has(guild_id)) {
                    return res.status(403).json({ error: 'You cannot use this server' });
                }
                guild_name = manageable.get(guild_id).name;
            }

            const insert = await run_exec(
                db,
                `INSERT INTO scan_requests
                    (requested_by, requested_by_tag, guild_id, guild_name,
                     channel_name, source, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'dashboard', 'pending', ?)`,
                [
                    String(req.user.id),
                    String(req.user.username || 'dashboard'),
                    guild_id,
                    guild_name,
                    'Dashboard',
                    new Date().toISOString(),
                ]
            );

            res.status(202).json({ ok: true, request_id: insert.lastID });
        } catch (error) {
            console.error('Dashboard scan request error:', error.message);
            res.status(500).json({ error: 'Unable to start the scan' });
        }
    });

    app.patch('/api/dashboard/guilds/:id', require_auth, async (req, res) => {
        const csrf_token = req.get('x-csrf-token');
        if (!csrf_token || csrf_token !== req.session.csrf_token) {
            return res.status(403).json({ error: 'Invalid CSRF token' });
        }

        const guild_id = String(req.params.id || '');
        if (!/^\d{17,20}$/.test(guild_id)) {
            return res.status(400).json({ error: 'Invalid server ID' });
        }

        const manageable = manageable_guild_map(req);
        if (!manageable.has(guild_id)) {
            return res.status(403).json({ error: 'You cannot manage this server' });
        }

        try {
            const guild_row = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT guild_id, roles, channels FROM guilds WHERE guild_id = ?',
                    [guild_id],
                    (error, row) => (error ? reject(error) : resolve(row))
                );
            });
            if (!guild_row) {
                return res.status(404).json({ error: 'The bot is not in this server' });
            }

            const current_row = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT * FROM guild_settings WHERE guild_id = ?',
                    [guild_id],
                    (error, row) => (error ? reject(error) : resolve(row))
                );
            });
            const current = normalize_settings(current_row);

            const language = req.body?.language;
            if (language !== undefined) {
                if (!SUPPORTED_LANGS.includes(language)) {
                    return res.status(400).json({ error: 'Unsupported language' });
                }
                current.language = language;
            }

            const ping_role = req.body?.ping_role;
            if (ping_role !== undefined) {
                const value = String(ping_role);
                const roles = parse_roles(guild_row.roles);
                const valid_role =
                    value === 'everyone' ||
                    (/^\d{17,20}$/.test(value) &&
                        (roles.length === 0 || roles.some((role) => role.id === value)));

                if (!valid_role) {
                    return res.status(400).json({ error: 'Invalid role' });
                }
                current.ping_role = value;
            }

            const channel_id = req.body?.channel_id;
            if (channel_id !== undefined) {
                const value =
                    channel_id === null || channel_id === ''
                        ? null
                        : String(channel_id);
                if (value !== null) {
                    const channels = parse_channels(guild_row.channels);
                    if (!/^\d{17,20}$/.test(value) || !channels.some((ch) => ch.id === value)) {
                        return res.status(400).json({ error: 'Invalid channel' });
                    }
                }
                current.channel_id = value;
            }

            for (const key of ['steam_on', 'epic_on', 'gog_on']) {
                if (req.body?.[key] !== undefined) {
                    const value = req.body[key];
                    if (![true, false, 1, 0, '1', '0'].includes(value)) {
                        return res.status(400).json({ error: `Invalid ${key}` });
                    }
                    current[key] = value === true || value === 1 || value === '1' ? 1 : 0;
                }
            }

            await run_exec(
                db,
                `INSERT INTO guild_settings
                    (guild_id, language, ping_role, steam_on, epic_on, gog_on, channel_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(guild_id) DO UPDATE SET
                    language = excluded.language,
                    ping_role = excluded.ping_role,
                    steam_on = excluded.steam_on,
                    epic_on = excluded.epic_on,
                    gog_on = excluded.gog_on,
                    channel_id = excluded.channel_id`,
                [
                    guild_id,
                    current.language,
                    current.ping_role,
                    current.steam_on,
                    current.epic_on,
                    current.gog_on,
                    current.channel_id,
                ]
            );

            res.json({ ok: true, settings: current });
        } catch (error) {
            console.error('Dashboard update error:', error.message);
            res.status(500).json({ error: 'Unable to update this server' });
        }
    });
}

module.exports = { register_dashboard_api };
