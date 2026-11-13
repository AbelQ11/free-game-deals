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
const { Client, GatewayIntentBits } = require('discord.js');

const { open_database } = require('../lib/db');

const SCAN_COOLDOWN = 15 * 60 * 1000;
const SCAN_INTERVAL = 30 * 60 * 1000;
const MAX_EMBEDS_PER_MESSAGE = 10;
const CLIENT_ID = process.env.CLIENT_ID;
const BASE_URL = (process.env.BASE_URL || 'https://free-game-deals.kiliotsu.eu').replace(
    /\/+$/,
    ''
);
const DB_NAME = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', 'deals_memory.db');

if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN is not set. Check your .env file.');
    process.exit(1);
}

const client = new Client({
    // Slash commands do not need the privileged MessageContent intent.
    intents: [GatewayIntentBits.Guilds],
});

const db = open_database(DB_NAME);

module.exports = {
    client,
    db,
    CLIENT_ID,
    BASE_URL,
    DB_NAME,
    SCAN_COOLDOWN,
    SCAN_INTERVAL,
    MAX_EMBEDS_PER_MESSAGE,
};
