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
const lang_data = require('../lib/lang');
const {
    ACTIVE_DEALS_WHERE,
    ADSENSE_CLIENT,
    ADSENSE_SLOTS,
    BASE_URL,
} = require('../lib/config');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
    infer_store,
} = require('../lib/sanitize');

function empty_store_counts() {
    return { steam: 0, epic: 0, gog: 0 };
}

function store_key(store) {
    return store === 'Epic Games' ? 'epic' : store === 'GOG' ? 'gog' : 'steam';
}

function register_api_routes(app, { db, run_query, run_get }) {
    app.get('/api/user', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (req.isAuthenticated()) {
            return res.json({
                loggedIn: true,
                user: {
                    username: req.user.username,
                    avatar: req.user.avatar,
                    id: req.user.id,
                },
            });
        }
        res.json({ loggedIn: false });
    });

    app.get('/api/config', (req, res) => {
        const permissions = /^\d+$/.test(process.env.BOT_PERMISSIONS || '')
            ? process.env.BOT_PERMISSIONS
            : '216064';

        res.set('Cache-Control', 'public, max-age=300');
        res.json({
            base_url: BASE_URL,
            invite_url:
                'https://discord.com/oauth2/authorize' +
                `?client_id=${encodeURIComponent(process.env.CLIENT_ID)}` +
                `&permissions=${permissions}&integration_type=0&scope=bot`,
            bot_thumb: '/favicon.jpg',
            translations: lang_data,
            ads: {
                enabled: Boolean(ADSENSE_CLIENT),
                client: ADSENSE_CLIENT,
                slots: ADSENSE_SLOTS,
            },
        });
    });

    app.get('/api/games', (req, res) => {
        const requested_limit = Number.parseInt(req.query.limit, 10);
        const requested_offset = Number.parseInt(req.query.offset, 10);
        const limit = Number.isFinite(requested_limit)
            ? Math.min(Math.max(requested_limit, 1), 500)
            : 200;
        const offset = Number.isFinite(requested_offset) ? Math.max(requested_offset, 0) : 0;

        run_query(
            db,
            `SELECT id, title, thumb, link, description, date, end_date, store
             FROM sent_deals
             WHERE ${ACTIVE_DEALS_WHERE}
             ORDER BY date DESC
             LIMIT ? OFFSET ?`,
            [Math.floor(Date.now() / 1000), limit, offset]
        )
            .then((rows) => {
                const games = rows.map((row) => {
                    const link = safe_link(row.link);
                    return {
                        id: clean_text(row.id, 120),
                        title: clean_text(row.title, 300),
                        thumb: safe_image(row.thumb),
                        link,
                        description: clean_description(row.description),
                        date: clean_text(row.date, 32),
                        end_date:
                            row.end_date == null || row.end_date === ''
                                ? null
                                : clean_text(row.end_date, 32),
                        store: clean_text(row.store, 32) || infer_store(link),
                    };
                });
                res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
                res.json(games);
            })
            .catch((error) => {
                console.error('Database error (/api/games):', error.message);
                res.status(500).json({ error: 'Database error' });
            });
    });

    app.get('/api/stats', (req, res) => {
        const now = Math.floor(Date.now() / 1000);

        Promise.all([
            run_get(db, "SELECT value FROM bot_meta WHERE key = 'guild_count'"),
            run_get(db, 'SELECT COUNT(*) AS count FROM guild_settings'),
            run_get(db, 'SELECT COUNT(*) AS count FROM sent_deals'),
            run_get(
                db,
                `SELECT COUNT(*) AS count FROM sent_deals WHERE ${ACTIVE_DEALS_WHERE}`,
                [now]
            ),
            run_query(db, 'SELECT store, COUNT(*) AS count FROM sent_deals GROUP BY store'),
            run_query(
                db,
                `SELECT store, COUNT(*) AS count FROM sent_deals
                 WHERE ${ACTIVE_DEALS_WHERE}
                 GROUP BY store`,
                [now]
            ),
        ])
            .then(([guild_count_row, servers, games, active_games, stores, active_stores]) => {
                const stores_counts = empty_store_counts();
                for (const row of stores) {
                    stores_counts[store_key(row.store)] += Number(row.count) || 0;
                }

                const active_stores_counts = empty_store_counts();
                for (const row of active_stores) {
                    active_stores_counts[store_key(row.store)] += Number(row.count) || 0;
                }

                const live_guild_count = Number(guild_count_row && guild_count_row.value);
                const total_servers = Number.isFinite(live_guild_count)
                    ? live_guild_count
                    : Number(servers && servers.count) || 0;

                res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
                res.json({
                    total_servers,
                    total_games: Number(games && games.count) || 0,
                    active_games: Number(active_games && active_games.count) || 0,
                    stores: stores_counts,
                    active_stores: active_stores_counts,
                    updated_at: new Date().toISOString(),
                });
            })
            .catch((error) => {
                console.error('Database error (/api/stats):', error.message);
                res.status(500).json({ error: 'Database error' });
            });
    });
}

module.exports = { register_api_routes };
