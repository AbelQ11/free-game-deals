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
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');

const {
    IS_PROD,
    PORT,
    BASE_URL,
    ROOT_DIR,
    DB_NAME,
    SESSION_COOKIE_NAME,
} = require('./lib/config');
const SQLiteSessionStore = require('./lib/session-store');
const { open_database, ensure_schema, run_query, run_get, run_exec } = require('./lib/db');
const { register_api_routes } = require('./routes/api');
const { register_auth_routes } = require('./routes/auth');
const { register_page_routes } = require('./routes/pages');
const { register_dashboard_routes } = require('./routes/dashboard');
const { register_dashboard_api } = require('./routes/dashboard-api');

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

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

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

register_auth_routes(app, { IS_PROD, SESSION_COOKIE_NAME });
register_api_routes(app, { db, run_query, run_get });
register_page_routes(app, { db, run_query, run_get });
register_dashboard_routes(app, { db });
register_dashboard_api(app, { db, run_query, run_exec });

app.use(
    express.static(path.join(ROOT_DIR, 'static'), {
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
    res.status(404).sendFile(path.join(ROOT_DIR, 'static', '404.html'));
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
