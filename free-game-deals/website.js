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
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
require('dotenv').config();

const lang_data = require('./lib/lang');
const SQLiteSessionStore = require('./lib/session-store');
const {
    open_database,
    ensure_schema,
    run_query,
    run_get,
} = require('./lib/db');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
    infer_store,
} = require('./lib/sanitize');

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 5000;
const BASE_URL = (process.env.BASE_URL || 'https://free-game-deals.kiliotsu.eu').replace(/\/+$/, '');
const DB_NAME = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, 'deals_memory.db');
const SESSION_COOKIE_NAME = 'fgd.sid';

// A deal is still displayed only while it is active.
// NULL / empty / legacy 'null' means the offer has no known end date yet.
const ACTIVE_DEALS_WHERE =
    "(end_date IS NULL OR end_date = '' OR end_date = 'null' OR CAST(end_date AS INTEGER) > ?)";

function require_env(name) {
    if (!process.env[name]) {
        throw new Error(`${name} is not set. Check your .env file.`);
    }
}

require_env('SESSION_SECRET');
require_env('CLIENT_ID');
require_env('CLIENT_SECRET');
require_env('CALLBACK_URL');

const MIN_SECRET_LENGTH = IS_PROD ? 32 : 16;
if (process.env.SESSION_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(
        `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`
    );
}

try {
    const callback = new URL(process.env.CALLBACK_URL);
    if (!['http:', 'https:'].includes(callback.protocol)) throw new Error('bad protocol');
    if (IS_PROD && callback.protocol !== 'https:') throw new Error('https required');
} catch (_) {
    throw new Error('CALLBACK_URL must be an absolute https URL in production.');
}

try {
    const base = new URL(BASE_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('bad protocol');
    if (IS_PROD && base.protocol !== 'https:') throw new Error('https required');
} catch (_) {
    throw new Error('BASE_URL must be an absolute https URL in production.');
}

const ADSENSE_CLIENT = /^ca-pub-\d{16}$/.test(process.env.ADSENSE_CLIENT || '')
    ? process.env.ADSENSE_CLIENT
    : null;
const ADSENSE_SLOTS = {
    header: /^\d{5,}$/.test(process.env.ADSENSE_SLOT_HEADER || '')
        ? process.env.ADSENSE_SLOT_HEADER
        : null,
    infeed: /^\d{5,}$/.test(process.env.ADSENSE_SLOT_INFEED || '')
        ? process.env.ADSENSE_SLOT_INFEED
        : null,
    footer: /^\d{5,}$/.test(process.env.ADSENSE_SLOT_FOOTER || '')
        ? process.env.ADSENSE_SLOT_FOOTER
        : null,
};

const app = express();
const db = open_database(DB_NAME);

app.disable('x-powered-by');

// Behind Nginx, Express must trust exactly one proxy hop. Without this,
// express-session will not set secure cookies and every visitor shares one IP
// for rate limiting.
if (process.env.TRUST_PROXY !== undefined) {
    const value = process.env.TRUST_PROXY;
    if (value === 'true') app.set('trust proxy', 1);
    else if (value === 'false') app.set('trust proxy', false);
    else if (!Number.isNaN(Number(value))) app.set('trust proxy', Number(value));
    else app.set('trust proxy', value);
} else if (IS_PROD) {
    app.set('trust proxy', 1);
}

app.use(compression());
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'https://cloud.umami.is',
                    'https://pagead2.googlesyndication.com',
                    'https://*.googlesyndication.com',
                    'https://*.doubleclick.net',
                    'https://adservice.google.com',
                    'https://*.googleadservices.com',
                    'https://fundingchoicesmessages.google.com',
                    'https://www.googletagservices.com',
                    'https://www.google.com',
                    'https://www.gstatic.com',
                    'https://ep1.adtrafficquality.google',
                    'https://ep2.adtrafficquality.google',
                ],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: [
                    "'self'",
                    'data:',
                    'blob:',
                    'https://cdn.cloudflare.steamstatic.com',
                    'https://cdn.discordapp.com',
                    'https://images.gog-statics.com',
                    'https://cdn.jsdelivr.net',
                    'https://*.epicgames.com',
                    'https://*.unrealengine.com',
                    'https://*.gog-statics.com',
                    'https://*.google.com',
                    'https://*.gstatic.com',
                    'https://*.doubleclick.net',
                    'https://pagead2.googlesyndication.com',
                    'https://*.googlesyndication.com',
                    'https://*.googleadservices.com',
                    'https://fundingchoicesmessages.google.com',
                ],
                connectSrc: [
                    "'self'",
                    'https://cloud.umami.is',
                    'https://api-gateway.umami.dev',
                    'https://fonts.googleapis.com',
                    'https://fonts.gstatic.com',
                    'https://pagead2.googlesyndication.com',
                    'https://*.googlesyndication.com',
                    'https://*.doubleclick.net',
                    'https://*.google.com',
                    'https://*.googleadservices.com',
                    'https://fundingchoicesmessages.google.com',
                    'https://ep1.adtrafficquality.google',
                    'https://ep2.adtrafficquality.google',
                ],
                frameSrc: [
                    'https://googleads.g.doubleclick.net',
                    'https://tpc.googlesyndication.com',
                    'https://www.google.com',
                    'https://*.google.com',
                    'https://*.googlesyndication.com',
                    'https://*.doubleclick.net',
                    'https://*.googleadservices.com',
                    'https://fundingchoicesmessages.google.com',
                ],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                // AdSense may attach inline handlers to elements it injects.
                scriptSrcAttr: ["'unsafe-inline'"],
                upgradeInsecureRequests: IS_PROD ? [] : null,
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
);

const api_limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});

const auth_limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
});

app.use('/api/', api_limiter);
app.use('/auth/discord', auth_limiter);

// Keep JSON endpoints and OAuth routes out of search results.
app.use('/api/', (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
});
app.use('/auth/', (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
});

const session_store = new SQLiteSessionStore(db, {
    ttl: 7 * 24 * 60 * 60 * 1000,
});

app.use(
    session({
        name: SESSION_COOKIE_NAME,
        secret: process.env.SESSION_SECRET,
        store: session_store,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: IS_PROD,
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        },
    })
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
    new DiscordStrategy(
        {
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            callbackURL: process.env.CALLBACK_URL,
            // Protect the OAuth flow against CSRF/login-CSRF.
            state: true,
            // The dashboard only needs the user's identity. Requesting the
            // `guilds` scope would copy the whole guild list into the session.
            scope: ['identify'],
        },
        (accessToken, refreshToken, profile, done) => {
            const user = {
                id: String(profile.id),
                username: clean_text(profile.username, 64) || 'Discord user',
                avatar: profile.avatar ? clean_text(profile.avatar, 128) : null,
            };
            return done(null, user);
        }
    )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/auth/discord', passport.authenticate('discord'));

app.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/?auth=failed' }),
    (req, res) => res.redirect('/')
);

// POST only: SameSite=Lax prevents cross-site POST requests from carrying the
// session cookie, so a stray link cannot log users out.
app.post('/auth/logout', (req, res, next) => {
    req.logout((error) => {
        if (error) return next(error);
        req.session.destroy(() => {
            res.clearCookie(SESSION_COOKIE_NAME, {
                httpOnly: true,
                secure: IS_PROD,
                sameSite: 'lax',
            });
            res.redirect('/');
        });
    });
});

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
    Promise.all([
        run_get(db, "SELECT value FROM bot_meta WHERE key = 'guild_count'"),
        run_get(db, 'SELECT COUNT(*) AS count FROM guild_settings'),
        run_get(db, 'SELECT COUNT(*) AS count FROM sent_deals'),
        run_query(db, 'SELECT store, COUNT(*) AS count FROM sent_deals GROUP BY store'),
    ])
        .then(([guild_count_row, servers, games, stores]) => {
            const stores_counts = { steam: 0, epic: 0, gog: 0 };
            for (const row of stores) {
                const key =
                    row.store === 'Epic Games' ? 'epic' : row.store === 'GOG' ? 'gog' : 'steam';
                stores_counts[key] += Number(row.count) || 0;
            }

            const live_guild_count = Number(guild_count_row && guild_count_row.value);
            const total_servers = Number.isFinite(live_guild_count)
                ? live_guild_count
                : Number(servers && servers.count) || 0;

            res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
            res.json({
                total_servers,
                total_games: Number(games && games.count) || 0,
                stores: stores_counts,
                updated_at: new Date().toISOString(),
            });
        })
        .catch((error) => {
            console.error('Database error (/api/stats):', error.message);
            res.status(500).json({ error: 'Database error' });
        });
});

const sitemap_limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

function escape_xml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function escape_html(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function store_badge_html(host) {
    if (host === 'steampowered.com' || host.endsWith('.steampowered.com')) {
        return '<span class="badge badge-steam">Steam</span>';
    }
    if (host === 'epicgames.com' || host.endsWith('.epicgames.com')) {
        return '<span class="badge badge-epic">Epic Games</span>';
    }
    if (host === 'gog.com' || host.endsWith('.gog.com')) {
        return '<span class="badge badge-gog">GOG.com</span>';
    }
    return '';
}

function parse_deal_date(value) {
    const text = clean_text(value, 32);
    if (!text) return null;
    const parsed = new Date(`${text.replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function format_date_text(value) {
    const parsed = value instanceof Date ? value : parse_deal_date(value);
    if (!parsed) return '';
    return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function format_unix_text(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return '';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function clamp_text(value, max_length) {
    const text = String(value || '');
    return text.length > max_length ? `${text.slice(0, max_length - 1)}…` : text;
}

function deal_is_active(row) {
    if (!row || !row.end_date || row.end_date === 'null') return true;
    const end = Number(row.end_date);
    return Number.isFinite(end) ? end > Date.now() / 1000 : true;
}

function render_related_cards(rows, current_id) {
    return (rows || [])
        .filter((row) => row.id !== current_id)
        .map((row) => {
            const id = clean_text(row.id, 120);
            if (!id) return '';
            const title = clean_text(row.title, 300) || 'Free game';
            const store = clean_text(row.store, 32) || 'Store';
            const date = format_date_text(row.date) || clean_text(row.date, 32);
            return (
                '<li>' +
                `<a href="/deal/${encodeURIComponent(id)}">${escape_html(title)}</a>` +
                `<span>${escape_html(store)}${date ? ` · ${escape_html(date)}` : ''}</span>` +
                '</li>'
            );
        })
        .join('');
}

function render_deal_page(row, related_rows) {
    const link = safe_link(row.link);
    const thumb = safe_image(row.thumb);
    const title = clean_text(row.title, 200) || 'Free game';
    const store = clean_text(row.store, 32) || infer_store(link);
    const id = clean_text(row.id, 120);
    const canonical = `${BASE_URL}/deal/${encodeURIComponent(id)}`;
    const date_obj = parse_deal_date(row.date);
    const date_text = date_obj ? format_date_text(date_obj) : clean_text(row.date, 32) || 'a recent day';
    const active = deal_is_active(row);
    const has_end_date =
        row.end_date != null &&
        row.end_date !== '' &&
        row.end_date !== 'null' &&
        Number.isFinite(Number(row.end_date));
    const end_text = active
        ? has_end_date
            ? ` The offer ends on ${format_unix_text(row.end_date)}.`
            : ' This offer is currently active.'
        : ' This offer has ended and is kept as part of the deal history.';

    const headline = `${title} ${active ? 'is currently 100% free' : 'was 100% free'} on ${store}`;
    const game_description = clean_description(row.description, 1200);
    const description = game_description || (active
        ? `${title} is currently available at 100% off on ${store}. This deal was tracked by Free Game Deals on ${date_text}.`
        : `${title} was available at 100% off on ${store}. Free Game Deals recorded this giveaway on ${date_text}.`);
    const meta_description = clamp_text(description, 160);
    const page_title = clamp_text(
        `${title} — ${active ? 'Free' : 'Was Free'} on ${store} | Free Game Deals`,
        90
    );
    const og_image = thumb || `${BASE_URL}/og-image.jpg`;
    const published_time = date_obj ? date_obj.toISOString() : new Date().toISOString();
    const offer_label = link ? `View the offer on ${store}` : 'Offer link unavailable';
    const link_attrs = link ? ' target="_blank" rel="noopener noreferrer"' : '';

    const offer = {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: active ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    };
    if (link) offer.url = link;
    if (date_obj) offer.validFrom = date_obj.toISOString();
    if (has_end_date) {
        offer.validThrough = new Date(Number(row.end_date) * 1000).toISOString();
    }

    const json_ld = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Product',
                name: title,
                image: [og_image],
                description: meta_description,
                offers: offer,
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'Home',
                        item: `${BASE_URL}/`,
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: title,
                        item: canonical,
                    },
                ],
            },
        ],
    }).replace(/</g, '\\u003c');

    const replacements = {
        __PAGE_TITLE__: escape_html(page_title),
        __META_DESCRIPTION__: escape_html(meta_description),
        __CANONICAL__: escape_html(canonical),
        __OG_IMAGE__: escape_html(og_image),
        __PUBLISHED_TIME__: escape_html(published_time),
        __GAME_TITLE__: escape_html(title),
        __GAME_TITLE_TEXT__: escape_html(title),
        __STORE__: escape_html(store),
        __STORE_TEXT__: escape_html(store),
        __HEADLINE__: escape_html(headline),
        __DATE_TEXT__: escape_html(date_text),
        __DATE_ISO__: escape_html(date_obj ? date_obj.toISOString() : ''),
        __ACTIVE__: active ? 'true' : 'false',
        __END_DATE_TEXT__: escape_html(has_end_date ? format_unix_text(row.end_date) : ''),
        __END_TS__: has_end_date ? String(row.end_date) : '',
        __END_TEXT__: escape_html(end_text),
        __DESCRIPTION__: escape_html(description),
        __DESCRIPTION_ATTR__: game_description ? 'data-game-description="true"' : '',
        __GAME_IMAGE__: escape_html(thumb || `${BASE_URL}/placeholder-game.jpg`),
        __GAME_URL__: escape_html(link || '#'),
        __GAME_LINK_ATTRS__: link_attrs,
        __OFFER_LABEL__: escape_html(offer_label),
        __RELATED_HTML__: render_related_cards(related_rows, id),
        __JSON_LD__: json_ld,
    };

    let html = get_deal_template();
    for (const [key, value] of Object.entries(replacements)) {
        html = html.split(key).join(value);
    }
    return html;
}

function render_game_cards(rows) {
    if (!rows || rows.length === 0) {
        return '<p id="loading-text" data-i18n="scanning">Scan in progress... Check back later!</p>';
    }

    return rows
        .map((row) => {
            const link = safe_link(row.link);
            const thumb = safe_image(row.thumb) || '/placeholder-game.jpg';
            const title = clean_text(row.title, 300) || 'Free game';
            const date = clean_text(row.date, 32);
            const store = clean_text(row.store, 32) || infer_store(link);
            const description = clean_description(row.description, 180);

            let host = '';
            try {
                host = link ? new URL(link).hostname.toLowerCase() : '';
            } catch (_) {
                host = '';
            }

            const badge = store_badge_html(host);
            const button_label =
                store === 'Epic Games'
                    ? 'View on Epic Games'
                    : store === 'GOG'
                      ? 'View on GOG'
                      : store === 'Steam'
                        ? 'View on Steam'
                        : 'View Offer';
            const end_timestamp = Number(row.end_date);
            const has_end_date =
                row.end_date != null &&
                row.end_date !== '' &&
                row.end_date !== 'null' &&
                Number.isFinite(end_timestamp);
            const end_date = has_end_date
                ? `<span class="end-date"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span data-timestamp="${escape_html(
                      row.end_date
                  )}">${end_timestamp <= Date.now() / 1000 ? 'Ended' : 'Ends'}: ${escape_html(
                      format_unix_text(row.end_date)
                  )}</span></span>`
                : '';
            const target = link ? ' target="_blank" rel="noopener noreferrer"' : '';
            const deal_id = clean_text(row.id, 120);
            const deal_path = deal_id ? `/deal/${encodeURIComponent(deal_id)}` : '#';
            const button_key =
                store === 'Epic Games'
                    ? 'viewEpic'
                    : store === 'GOG'
                      ? 'viewGog'
                      : store === 'Steam'
                        ? 'viewSteam'
                        : 'viewOffer';

            const overlay = deal_id
                ? `<a class="card-link-overlay" href="${escape_html(
                      deal_path
                  )}" aria-label="${escape_html(`View details for ${title}`)}"></a>`
                : '';

            return (
                '<article class="card">' +
                overlay +
                '<div class="img-wrapper">' +
                `<img src="${escape_html(thumb)}" alt="${escape_html(
                    `${title} — free game cover`
                )}" loading="lazy" decoding="async" width="480" height="160" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/placeholder-game.jpg'">` +
                badge +
                '</div>' +
                '<div class="info">' +
                `<h3>${escape_html(title)}</h3>` +
                (description
                    ? `<p class="card-description">${escape_html(description)}</p>`
                    : '') +
                `<span class="date">${escape_html(date)}</span>` +
                end_date +
                `<a href="${escape_html(link || '#')}"${target} class="btn-card" data-i18n="${button_key}">${escape_html(
                    button_label
                )}</a>` +
                '</div>' +
                '</article>'
            );
        })
        .join('');
}

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
                last_mod_date = clean_text(rows[0].date, 32).split(' ')[0] || last_mod_date;
            }

            const pages = [
                { path: '/', lastmod: last_mod_date, changefreq: 'hourly', priority: '1.0' },
                { path: '/stats', lastmod: last_mod_date, changefreq: 'daily', priority: '0.7' },
            ];

            for (const row of rows) {
                const id = clean_text(row.id, 120);
                if (!id) continue;
                pages.push({
                    path: `/deal/${encodeURIComponent(id)}`,
                    lastmod: clean_text(row.date, 32).split(' ')[0] || last_mod_date,
                    changefreq: 'weekly',
                    priority: '0.6',
                });
            }

            let xml = '<?xml version="1.0" encoding="UTF-8"?>';
            xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
            for (const page of pages) {
                xml += `<url><loc>${escape_xml(`${BASE_URL}${page.path}`)}</loc><lastmod>${escape_xml(
                    page.lastmod
                )}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${
                    page.priority
                }</priority></url>`;
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
        background_color: '#090e17',
        theme_color: '#3b82f6',
        icons: [
            {
                src: '/favicon.jpg',
                sizes: '962x703',
                type: 'image/png',
                purpose: 'any',
            },
        ],
    });
});

// The public base URL is configurable through BASE_URL, so inject it into the
// static HTML instead of hardcoding a domain in the page.
function fill_i18n(html, lang = 'en') {
    const translations = lang_data[lang] || lang_data.en || {};
    return html.replace(
        /<([a-zA-Z0-9]+)([^>]*\bdata-i18n="([^"]+)"[^>]*)><\/\1>/g,
        (match, tag, attrs, key) => {
            const value = translations[key];
            if (!value) return match;
            return `<${tag}${attrs}>${value}</${tag}>`;
        }
    );
}

const INDEX_HTML_PATH = path.join(__dirname, 'static', 'index.html');
const STATS_HTML_PATH = path.join(__dirname, 'static', 'stats.html');
const DEAL_TEMPLATE_PATH = path.join(__dirname, 'templates', 'deal.html');
let index_template_cache = null;
let stats_html_cache = null;
let deal_template_cache = null;

function get_index_template() {
    if (!index_template_cache) {
        index_template_cache = fill_i18n(
            fs
                .readFileSync(INDEX_HTML_PATH, 'utf8')
                .replace(/__BASE_URL__/g, BASE_URL)
        );
    }
    return index_template_cache;
}

function get_index_html(games_html) {
    return get_index_template().replace('__GAMES_HTML__', games_html);
}

function get_stats_html() {
    if (!stats_html_cache) {
        stats_html_cache = fill_i18n(
            fs
                .readFileSync(STATS_HTML_PATH, 'utf8')
                .replace(/__BASE_URL__/g, BASE_URL)
        );
    }
    return stats_html_cache;
}

function get_deal_template() {
    if (!deal_template_cache) {
        deal_template_cache = fill_i18n(
            fs
                .readFileSync(DEAL_TEMPLATE_PATH, 'utf8')
                .replace(/__BASE_URL__/g, BASE_URL)
        );
    }
    return deal_template_cache;
}

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
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'no-cache');
            res.send(get_index_html(render_game_cards(rows)));
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
    res.send(get_stats_html());
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
                res.send(render_deal_page(row, related));
            });
        })
        .catch((error) => next(error));
});

app.use(
    express.static(path.join(__dirname, 'static'), {
        maxAge: IS_PROD ? '1h' : 0,
        etag: true,
        index: 'index.html',
        setHeaders: (res, file_path) => {
            if (/\.(?:jpe?g|png|svg|webp|ico|woff2?)$/i.test(file_path)) {
                res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
            }
        },
    })
);

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    if (req.path.startsWith('/auth/') || req.path === '/ads.txt') {
        return res.status(404).type('text/plain').send('Not found');
    }
    res.status(404).sendFile(path.join(__dirname, 'static', '404.html'));
});

app.use((error, req, res, next) => {
    console.error('Unhandled request error:', error);
    if (res.headersSent) return next(error);
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(500).type('text/plain').send('Internal server error');
});

let server = null;

async function start() {
    await ensure_schema(db);

    server = app.listen(PORT, '0.0.0.0', () => {
        console.log('-----------------------------------------------');
        console.log(`Server running on port ${PORT}`);
        console.log(`Base URL: ${BASE_URL}`);
        console.log(`Mode: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`);
        console.log('-----------------------------------------------');
    });

    server.on('error', (error) => {
        console.error('HTTP server error:', error);
        process.exit(1);
    });
}

function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    const done = () => db.close(() => process.exit(0));

    if (!server) return done();
    server.close(done);
    setTimeout(() => process.exit(1), 10000).unref();
}

if (require.main === module) {
    start().catch((error) => {
        console.error('FATAL: could not start the website:', error);
        process.exit(1);
    });

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { app, start };
