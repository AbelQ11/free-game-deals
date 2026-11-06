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
const cheerio = require('cheerio');
const { fetch_with_retry } = require('./http');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
} = require('../lib/sanitize');

const STEAM_COUNTRY = process.env.STEAM_COUNTRY || 'US';
const STEAM_MAX_PAGES = Math.max(1, Math.min(Number(process.env.STEAM_MAX_PAGES) || 5, 20));
const STEAM_DESCRIPTION_LIMIT = Math.max(
    1,
    Math.min(Number(process.env.STEAM_DESCRIPTION_LIMIT) || 40, 100)
);
const STEAM_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const COOKIES = `steamCountry=${STEAM_COUNTRY}|00; birthtime=946684801`;
const STEAM_URL = 'https://store.steampowered.com/search/?maxprice=free&specials=1';
const NON_GAME_TITLE =
    /(demo|prologue|playtest|soundtrack|artbook|art book|season pass|expansion pass|upgrade pack|\bdlc\b|\bpack\b)/i;

function is_free_price(final_price, discount_percent) {
    const price = String(final_price || '').trim().toLowerCase();
    const discount = String(discount_percent || '').trim();
    return discount.includes('100') || price === 'free' || /^(?:[^\d]*)?0[.,]00/.test(price);
}

async function fetch_steam_description(app_id) {
    try {
        const response = await fetch_with_retry(
            `${STEAM_DETAILS_URL}?appids=${encodeURIComponent(app_id)}` +
                `&l=english&cc=${encodeURIComponent(STEAM_COUNTRY)}`
        );
        const entry = response.data?.[app_id];

        if (!entry || !entry.success || !entry.data) return '';

        return clean_description(
            entry.data.short_description || entry.data.detailed_description || ''
        );
    } catch (error) {
        console.warn(`Steam description fetch failed for ${app_id}: ${error.message}`);
        return '';
    }
}

async function scrape_steam() {
    const found = new Map();
    let complete = true;

    for (let page = 1; page <= STEAM_MAX_PAGES; page++) {
        try {
            const response = await fetch_with_retry(`${STEAM_URL}&page=${page}`, {
                headers: { Cookie: COOKIES },
            });
            const $ = cheerio.load(response.data);
            const rows = $('.search_result_row');
            if (rows.length === 0) {
                if (page === 1 && $('#search_resultsRows').length === 0) complete = false;
                break;
            }

            rows.each((_, element) => {
                try {
                    const game = $(element);
                    const app_id = String(game.attr('data-ds-appid') || '')
                        .split(',')[0]
                        .trim();
                    if (!/^\d+$/.test(app_id)) return;

                    const final_price = game.find('.discount_final_price').text();
                    const discount_percent = game.find('.discount_pct').text();
                    if (!is_free_price(final_price, discount_percent)) return;

                    const title = clean_text(game.find('.title').text(), 200);
                    if (!title || NON_GAME_TITLE.test(title)) return;

                    const link = safe_link(`https://store.steampowered.com/app/${app_id}`);
                    const thumb = safe_image(
                        `https://cdn.cloudflare.steamstatic.com/steam/apps/${app_id}/header.jpg`
                    );
                    if (!link) return;

                    found.set(app_id, {
                        id: app_id,
                        title,
                        link,
                        thumb,
                        description: '',
                        store: 'Steam',
                        end_date: null,
                    });
                } catch (error) {
                    console.error('Steam game parse error:', error.message);
                    complete = false;
                }
            });

            if (rows.length === 0) break;
            await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`Steam scan error (page ${page}):`, error.message);
            complete = false;
            break;
        }
    }

    // Fetch the store description for each free game once the listing scan is
    // done, from the public appdetails endpoint.
    let enriched = 0;
    for (const deal of found.values()) {
        if (enriched >= STEAM_DESCRIPTION_LIMIT) break;
        deal.description = await fetch_steam_description(deal.id);
        enriched += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return {
        store: 'Steam',
        ok: complete,
        found_ids: [...found.keys()],
        new_deals: [...found.values()],
    };
}

module.exports = scrape_steam;
module.exports.fetch_steam_description = fetch_steam_description;
