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

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US'
};

async function scrape_gog(run_query, run_exec) {
    let new_deals = [];
    let found_ids = [];
    try {
        const gog_api_url = "https://catalog.gog.com/v1/catalog?limit=20&price=between:0,0";
        const response = await axios.get(gog_api_url, { headers: HEADERS, timeout: 10000 });
        const products = response.data.products || [];
        for (const game of products) {
            const title = game.title;
            const slug = game.slug;
            const game_id = "gog_" + slug;
            const isFree = game.price.final === "Free" || game.price.final.includes("0.00");
            const hasDiscount = game.price.discount !== null && game.price.discount !== "0%";

            if (isFree && hasDiscount) {
                found_ids.push(game_id);

                const rows = await run_query("SELECT 1 FROM sent_deals WHERE id = ?", [game_id]);

                if (rows.length === 0) {
                    const thumb = game.coverHorizontal || game.logo || "https://images.gog-statics.com/logo/gog_logo.svg";
                    const link = `https://www.gog.com/en/game/${slug}`;
                    const date_now = new Date().toISOString().replace('T', ' ').substring(0, 16);

                    await run_exec(
                        "INSERT INTO sent_deals (id, title, thumb, link, date, end_date) VALUES (?, ?, ?, ?, ?, ?)",
                        [game_id, title, thumb, link, date_now, null]
                    );

                    new_deals.push({ title, link, thumb, store: "GOG", end_date: null });
                }
            }
        }
    } catch (err) {
        console.error("GOG API Error:", err.message);
    }

    return { new_deals, found_ids };
}

module.exports = scrape_gog;