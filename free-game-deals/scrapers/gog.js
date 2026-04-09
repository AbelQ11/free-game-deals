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

async function scrape_gog(run_query) {
    let new_deals = [];
    let found_ids = [];

    try {
        const gog_url = "https://www.gog.com/";
        const response = await axios.get(gog_url, { headers: HEADERS });
        const $ = cheerio.load(response.data);

        const giveaway_banner = $('a[href*="/giveaway/claim"]');

        if (giveaway_banner.length > 0) {
            const raw_link = giveaway_banner.attr('href');
            const slug = raw_link.split('/').filter(Boolean).pop();
            const game_id = "gog_" + slug;
            found_ids.push(game_id);

            const rows = await run_query("SELECT 1 FROM sent_deals WHERE id = ?", [game_id]);
            if (rows.length === 0) {
                let title = giveaway_banner.attr('title') || giveaway_banner.text().trim();

                if (!title || title.toLowerCase().includes('claim') || title.length < 3) {
                    title = slug.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                }

                const link = "https://www.gog.com/#giveaway";
                const thumb = "https://images.gog-statics.com/logo/gog_logo.svg";
                const date_now = new Date().toISOString().replace('T', ' ').substring(0, 16);

                await run_query("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [game_id, title, thumb, link, date_now, null]);
                new_deals.push({ title, link, thumb, store: "GOG", end_date: null });
            }
        }
    } catch (err) { console.error("Erreur GOG:", err.message); }

    return { new_deals, found_ids };
}

module.exports = scrape_gog;