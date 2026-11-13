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
const rateLimit = require('express-rate-limit');

const { ACTIVE_DEALS_WHERE, BASE_URL } = require('../lib/config');
const {
    clean_text,
    clean_description,
    safe_link,
    infer_store,
} = require('../lib/sanitize');
const {
    escape_xml,
    render_game_cards,
    render_deal_page,
    get_index_html,
    get_stats_html,
    get_request_lang,
} = require('../lib/render');

function register_page_routes(app, { db, run_query, run_get }) {
    const sitemap_limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
    });

    app.get('/sitemap.xml', sitemap_limiter, (req, res, next) => {
        run_query(
            db,
            `SELECT id, date FROM sent_deals
             WHERE ${ACTIVE_DEALS_WHERE}
             ORDER BY date DESC
             LIMIT 500`,
            [Math.floor(Date.now() / 1000)]
        )
            .then((rows) => {
                let last_mod_date = new Date().toISOString().split('T')[0];
                if (rows.length > 0 && rows[0].date) {
                    last_mod_date =
                        clean_text(rows[0].date, 32).split(' ')[0] || last_mod_date;
                }

                const pages = [
                    {
                        path: '/',
                        lastmod: last_mod_date,
                        changefreq: 'hourly',
                        priority: '1.0',
                    },
                    {
                        path: '/stats',
                        lastmod: last_mod_date,
                        changefreq: 'daily',
                        priority: '0.7',
                    },
                ];

                for (const row of rows) {
                    const id = clean_text(row.id, 120);
                    if (!id) continue;
                    pages.push({
                        path: `/deal/${encodeURIComponent(id)}`,
                        lastmod:
                            clean_text(row.date, 32).split(' ')[0] || last_mod_date,
                        changefreq: 'weekly',
                        priority: '0.6',
                    });
                }

                let xml = '<?xml version="1.0" encoding="UTF-8"?>';
                xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
                for (const page of pages) {
                    xml += `<url><loc>${escape_xml(
                        `${BASE_URL}${page.path}`
                    )}</loc><lastmod>${escape_xml(page.lastmod)}</lastmod><changefreq>${
                        page.changefreq
                    }</changefreq><priority>${page.priority}</priority></url>`;
                }
                xml += '</urlset>';

                res.set('Content-Type', 'text/xml; charset=utf-8');
                res.set('Cache-Control', 'public, max-age=3600');
                res.send(xml);
            })
            .catch((error) => next(error));
    });

    app.get('/robots.txt', (req, res) => {
        res.type('text/plain');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(
            `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nSitemap: ${BASE_URL}/sitemap.xml\n`
        );
    });

    app.get('/feed.xml', sitemap_limiter, (req, res, next) => {
        run_query(
            db,
            `SELECT id, title, link, description, date, end_date, store
             FROM sent_deals
             WHERE ${ACTIVE_DEALS_WHERE}
             ORDER BY date DESC
             LIMIT 50`,
            [Math.floor(Date.now() / 1000)]
        )
            .then((rows) => {
                const items = rows
                    .map((row) => {
                        const link = safe_link(row.link);
                        if (!link) return '';

                        const title = clean_text(row.title, 300) || 'Free game';
                        const store = clean_text(row.store, 32) || infer_store(link);
                        const id = clean_text(row.id, 120);
                        const deal_url = id
                            ? `${BASE_URL}/deal/${encodeURIComponent(id)}`
                            : link;
                        const parsed_date = new Date(
                            `${clean_text(row.date, 32).replace(' ', 'T')}Z`
                        );
                        const pub_date = Number.isNaN(parsed_date.getTime())
                            ? new Date()
                            : parsed_date;

                        return (
                            '<item>' +
                            `<title>${escape_xml(title)}</title>` +
                            `<link>${escape_xml(deal_url)}</link>` +
                            `<guid isPermaLink="true">${escape_xml(deal_url)}</guid>` +
                            `<pubDate>${pub_date.toUTCString()}</pubDate>` +
                            `<description>${escape_xml(
                                clean_description(row.description, 400) ||
                                    `100% free on ${store} — tracked by Free Game Deals.`
                            )}</description>` +
                            '</item>'
                        );
                    })
                    .join('');

                const xml =
                    '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">' +
                    '<channel>' +
                    '<title>Free Game Deals</title>' +
                    `<link>${BASE_URL}/</link>` +
                    '<description>Free PC games on Steam, Epic Games and GOG.</description>' +
                    '<language>en</language>' +
                    `<atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>` +
                    items +
                    '</channel></rss>';

                res.set('Content-Type', 'application/rss+xml; charset=utf-8');
                res.set('Cache-Control', 'public, max-age=600');
                res.send(xml);
            })
            .catch((error) => next(error));
    });

    app.get('/site.webmanifest', (req, res) => {
        res.type('application/manifest+json');
        res.set('Cache-Control', 'public, max-age=86400');
        res.json({
            name: 'Free Game Deals',
            short_name: 'FGD',
            description:
                'Track 100% free PC games on Steam, Epic Games Store and GOG, with Discord alerts.',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#0b0f1a',
            theme_color: '#ff3da6',
            icons: [
                {
                    src: '/favicon.jpg',
                    sizes: '256x256',
                    type: 'image/jpeg',
                    purpose: 'any',
                },
            ],
        });
    });

    app.get('/', (req, res, next) => {
        run_query(
            db,
            `SELECT id, title, thumb, link, description, date, end_date, store
             FROM sent_deals
             WHERE ${ACTIVE_DEALS_WHERE}
             ORDER BY date DESC
             LIMIT 12`,
            [Math.floor(Date.now() / 1000)]
        )
            .then((rows) => {
                const lang = get_request_lang(req);
                res.set('Content-Type', 'text/html; charset=utf-8');
                res.set('Cache-Control', 'no-cache');
                res.send(get_index_html(render_game_cards(rows, lang), lang));
            })
            .catch((error) => next(error));
    });

    app.get('/index.html', (req, res) => {
        // Consolidate duplicate URLs under the canonical homepage.
        res.redirect(301, '/');
    });

    app.get('/stats', (req, res) => {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        res.send(get_stats_html(get_request_lang(req)));
    });

    app.get('/stats.html', (req, res) => {
        res.redirect(301, '/stats');
    });

    app.get('/deal/:id', (req, res, next) => {
        const deal_id = String(req.params.id || '');
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(deal_id)) {
            return res.status(404).type('text/plain').send('Not found');
        }

        run_get(
            db,
            `SELECT id, title, thumb, link, description, date, end_date, store
             FROM sent_deals
             WHERE id = ? AND ${ACTIVE_DEALS_WHERE}`,
            [deal_id, Math.floor(Date.now() / 1000)]
        )
            .then((row) => {
                if (!row) return res.status(404).type('text/plain').send('Not found');

                return run_query(
                    db,
                    `SELECT id, title, thumb, link, date, end_date, store
                     FROM sent_deals
                     WHERE id != ? AND ${ACTIVE_DEALS_WHERE}
                     ORDER BY date DESC
                     LIMIT 6`,
                    [deal_id, Math.floor(Date.now() / 1000)]
                ).then((related) => {
                    res.set('Content-Type', 'text/html; charset=utf-8');
                    res.set('Cache-Control', 'no-cache');
                    res.send(render_deal_page(row, related, get_request_lang(req)));
                });
            })
            .catch((error) => next(error));
    });
}

module.exports = { register_page_routes };
