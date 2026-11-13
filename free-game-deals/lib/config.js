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
const path = require('path');
require('dotenv').config();

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 5000;
const BASE_URL = (process.env.BASE_URL || 'https://free-game-deals.kiliotsu.eu').replace(
    /\/+$/,
    ''
);
const ROOT_DIR = path.join(__dirname, '..');
const DB_NAME = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(ROOT_DIR, 'deals_memory.db');
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

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'pt', 'de', 'it', 'ru'];

module.exports = {
    IS_PROD,
    PORT,
    BASE_URL,
    ROOT_DIR,
    DB_NAME,
    SESSION_COOKIE_NAME,
    ACTIVE_DEALS_WHERE,
    ADSENSE_CLIENT,
    ADSENSE_SLOTS,
    SUPPORTED_LANGS,
};
