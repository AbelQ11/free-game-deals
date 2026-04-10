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
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const lang_data = require('./lang.json');

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is not set. Refusing to start.");
}
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    throw new Error("Missing required Discord environment variables (DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET).");
}

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DB_NAME = path.join(__dirname, "deals_memory.db");

const db = new sqlite3.Database(DB_NAME, (err) => {
    if (err) console.error("Database error:", err.message);
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "https://cloud.umami.is",
                "https://cdn.jsdelivr.net"
            ],
            styleSrc: [
                "'self'",
                "https://fonts.googleapis.com",
                "'unsafe-inline'"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://cdn.cloudflare.steamstatic.com",
                "https://cdn.discordapp.com",
                "https://images.gog-statics.com",
                "https://cdn.jsdelivr.net",
                "https://*.epicgames.com"
            ],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PROD,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

app.use(passport.initialize());
app.use(passport.session());

const scopes = ['identify', 'guilds'];
passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL,
    scope: scopes
}, function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), function(req, res) {
    res.redirect('/');
});

app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ loggedIn: true, user: { username: req.user.username, avatar: req.user.avatar, id: req.user.id } });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/sitemap.xml', (req, res) => {
    const domain = "https://free-game-deals.duckdns.org";
    db.get("SELECT date FROM sent_deals ORDER BY date DESC LIMIT 1", [], (err, row) => {
        let last_mod_date = new Date().toISOString().split('T')[0];
        if (!err && row && row.date) {
            last_mod_date = row.date.split(' ')[0];
        }

        let xml = '<?xml version="1.0" encoding="UTF-8"?>';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        xml += '<url>';
        xml += `<loc>${domain}/</loc>`;
        xml += `<lastmod>${last_mod_date}</lastmod>`;
        xml += '<changefreq>hourly</changefreq>';
        xml += '<priority>1.0</priority>';
        xml += '</url>';
        xml += '</urlset>';

        res.set('Content-Type', 'text/xml');
        res.status(200).send(xml);
    });
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nSitemap: https://free-game-deals.duckdns.org/sitemap.xml`);
});

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP. Please retry in 15min."
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'static')));

const CLIENT_ID = process.env.CLIENT_ID;
const INVITE_LINK = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=4503601775012880&integration_type=0&scope=bot`;
const BOT_IMAGE_URL = "/favicon.jpg";

app.get('/api/config', (req, res) => {
    res.json({
        invite_url: INVITE_LINK,
        bot_thumb: BOT_IMAGE_URL,
        translations: lang_data
    });
});

app.get('/api/games', (req, res) => {
    db.all("SELECT * FROM sent_deals ORDER BY date DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Internal server error" });
        res.json(rows);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node.js server runs on ${PORT} (${IS_PROD ? 'production' : 'development'})`);
});