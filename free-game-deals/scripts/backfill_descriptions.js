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

/**
 * Fill the description column for deals that were stored before the bot
 * started capturing descriptions. Safe to run more than once.
 */
const path = require('path');
require('dotenv').config();

const { open_database, ensure_schema, run_query, run_exec } = require('../lib/db');
const { clean_description } = require('../lib/sanitize');
const scrape_epic = require('../scrapers/epic_games');
const { fetch_steam_description } = require('../scrapers/steam');
const { fetch_gog_description } = require('../scrapers/gog');

const DB_NAME = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', 'deals_memory.db');

function steam_app_id(row) {
    const match = String(row.link || '').match(/\/app\/(\d+)/);
    if (match) return match[1];

    const id = String(row.id || '');
    return /^\d+$/.test(id) ? id : null;
}

function gog_product_id(row) {
    const match = String(row.id || '').match(/^gog_(\d+)$/);
    return match ? match[1] : null;
}

async function main() {
    const db = open_database(DB_NAME);
    await ensure_schema(db);

    const now = Math.floor(Date.now() / 1000);
    const rows = await run_query(
        db,
        `SELECT id, title, link, store, description
         FROM sent_deals
         WHERE (end_date IS NULL OR end_date = '' OR end_date = 'null'
                OR CAST(end_date AS INTEGER) > ?)
           AND (description IS NULL OR description = '')
         ORDER BY date DESC`,
        [now]
    );

    if (rows.length === 0) {
        console.log('No active deal is missing a description.');
        db.close();
        return;
    }

    console.log(`Found ${rows.length} active deal(s) without a description.`);

    const epic_games = new Map();
    const needs_epic = rows.some(
        (row) => /^epic_/i.test(row.id) || /epic games/i.test(row.store || '')
    );

    if (needs_epic) {
        try {
            const result = await scrape_epic();
            for (const game of result.new_deals || []) {
                epic_games.set(game.id, game.description || '');
            }
        } catch (error) {
            console.warn('Could not fetch Epic descriptions:', error.message);
        }
    }

    let updated = 0;

    for (const row of rows) {
        let description = '';

        if (/^epic_/i.test(row.id) || /epic games/i.test(row.store || '')) {
            description = epic_games.get(row.id) || '';
        } else if (/gog/i.test(row.store || '') || /^gog_/i.test(row.id)) {
            description = await fetch_gog_description(gog_product_id(row));
        } else {
            description = await fetch_steam_description(steam_app_id(row));
        }

        description = clean_description(description);
        if (!description) {
            console.warn(`No description found for ${row.id} (${row.title}).`);
            continue;
        }

        await run_exec(db, 'UPDATE sent_deals SET description = ? WHERE id = ?', [
            description,
            row.id,
        ]);
        updated += 1;
        console.log(`Updated ${row.id} (${row.title}).`);
    }

    console.log(`Done: ${updated}/${rows.length} description(s) updated.`);
    db.close();
}

main().catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
});
