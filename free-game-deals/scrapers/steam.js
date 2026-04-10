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
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' };
const STEAM_COUNTRY = process.env.STEAM_COUNTRY || 'US';
const COOKIES = `steamCountry=${STEAM_COUNTRY}|00; birthtime=946684801`;

async function scrape_steam(run_query, run_exec) {
    let new_deals = [];
    let found_ids = [];

    try {
        const steam_url = "https://store.steampowered.com/search/?maxprice=free&specials=1";
        const response = await axios.get(steam_url, { headers: { ...HEADERS, Cookie: COOKIES } });
        const $ = cheerio.load(response.data);
        const games = $('.search_result_row');

        for (let i = 0; i < games.length; i++) {
            try {
                const game = $(games[i]);
                const game_id = game.attr('data-ds-appid');
                if (!game_id) continue;

                found_ids.push(game_id);
                const title = game.find('.title').text();
                const full_text = game.text().trim().toLowerCase();

                if (["0,00€", "0.00€", "100%", "gratuit", "free"].some(k => full_text.includes(k))) {
                    const rows = await run_query("SELECT 1 FROM sent_deals WHERE id = ?", [game_id]);
                    if (rows.length === 0) {
                        const link = `https://store.steampowered.com/app/${game_id}`;
                        const thumb = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game_id}/header.jpg`;
                        const date_now = new Date().toISOString().replace('T', ' ').substring(0, 16);

                        await run_exec(
                            "INSERT INTO sent_deals (id, title, thumb, link, date, end_date) VALUES (?, ?, ?, ?, ?, ?)",
                            [game_id, title, thumb, link, date_now, null]
                        );
                        new_deals.push({ title, link, thumb, store: "Steam", end_date: null });
                    }
                }
            } catch (err) { console.error("Steam game parse error:", err); }
        }
    } catch (err) { console.error("Steam Error:", err.message); }

    return { new_deals, found_ids };
}

module.exports = scrape_steam;