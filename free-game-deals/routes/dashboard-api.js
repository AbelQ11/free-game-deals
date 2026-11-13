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

const { SUPPORTED_LANGS } = require('../lib/config');

const DEFAULT_SETTINGS = {
    language: 'en',
    ping_role: 'everyone',
    steam_on: 1,
    epic_on: 1,
    gog_on: 1,
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

function normalize_settings(row) {
    return {
        language: SUPPORTED_LANGS.includes(row?.language) ? row.language : DEFAULT_SETTINGS.language,
        ping_role: row?.ping_role ? String(row.ping_role) : DEFAULT_SETTINGS.ping_role,
        steam_on: row?.steam_on === 0 || row?.steam_on === '0' ? 0 : 1,
        epic_on: row?.epic_on === 0 || row?.epic_on === '0' ? 0 : 1,
        gog_on: row?.gog_on === 0 || row?.gog_on === '0' ? 0 : 1,
    };
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
                run_query(db, 'SELECT guild_id, name, icon, roles FROM guilds'),
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
                    'SELECT guild_id, roles FROM guilds WHERE guild_id = ?',
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
                    (guild_id, language, ping_role, steam_on, epic_on, gog_on)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(guild_id) DO UPDATE SET
                    language = excluded.language,
                    ping_role = excluded.ping_role,
                    steam_on = excluded.steam_on,
                    epic_on = excluded.epic_on,
                    gog_on = excluded.gog_on`,
                [
                    guild_id,
                    current.language,
                    current.ping_role,
                    current.steam_on,
                    current.epic_on,
                    current.gog_on,
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
