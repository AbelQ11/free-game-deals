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
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');

const { clean_text } = require('../lib/sanitize');

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

function can_manage_guild(permissions) {
    try {
        const value = BigInt(permissions || 0);
        return (
            (value & ADMINISTRATOR) === ADMINISTRATOR ||
            (value & MANAGE_GUILD) === MANAGE_GUILD
        );
    } catch (_) {
        return false;
    }
}

function manageable_guilds(profile) {
    const guilds = Array.isArray(profile.guilds) ? profile.guilds : [];

    return guilds
        .filter((guild) => can_manage_guild(guild.permissions))
        .map((guild) => ({
            id: String(guild.id),
            name: clean_text(guild.name, 100) || 'Discord server',
            icon: guild.icon ? clean_text(guild.icon, 128) : null,
            owner: Boolean(guild.owner),
            permissions: String(guild.permissions || 0),
        }));
}

function register_auth_routes(app, { IS_PROD, SESSION_COOKIE_NAME }) {
    passport.use(
        new DiscordStrategy(
            {
                clientID: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                callbackURL: process.env.CALLBACK_URL,
                // Protect the OAuth flow against CSRF/login-CSRF.
                state: true,
                // `guilds` is required to know which servers the user can
                // manage. The full list is filtered before being stored.
                scope: ['identify', 'guilds'],
            },
            (accessToken, refreshToken, profile, done) => {
                const user = {
                    id: String(profile.id),
                    username: clean_text(profile.username, 64) || 'Discord user',
                    avatar: profile.avatar ? clean_text(profile.avatar, 128) : null,
                    guilds: manageable_guilds(profile),
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
        (req, res) => res.redirect('/dashboard')
    );

    // POST only: SameSite=Lax prevents cross-site POST requests from carrying
    // the session cookie, so a stray link cannot log users out.
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
}

module.exports = {
    register_auth_routes,
    can_manage_guild,
    manageable_guilds,
};
