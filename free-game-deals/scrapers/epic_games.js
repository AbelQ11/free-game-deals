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

async function scrape_epic(run_query) {
    let new_deals = [];
    let found_ids = [];

    try {
        const epic_url = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";
        const response = await axios.get(epic_url);
        const elements = response.data.data.Catalog.searchStore.elements;

        for (const game of elements) {
            try {
                const is_free = game.price.totalPrice.discountPrice === 0;
                const promos = game.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
                const active_promo = promos.length > 0;

                if (is_free && active_promo) {
                    const game_id = "epic_" + game.id;
                    found_ids.push(game_id);

                    const rows = await run_query("SELECT 1 FROM sent_deals WHERE id = ?", [game_id]);
                    if (rows.length === 0) {
                        const title = game.title;
                        const slug = game.catalogNs?.mappings?.[0]?.pageSlug || game.productSlug || game.urlSlug;
                        const link = `https://store.epicgames.com/p/${slug}`;
                        let thumb = "";
                        const image = game.keyImages.find(img => img.type === "OfferImageWide" || img.type === "Thumbnail");
                        if (image) thumb = image.url;

                        const end_date_iso = promos[0].endDate;
                        const end_date_unix = Math.floor(new Date(end_date_iso).getTime() / 1000);
                        const date_now = new Date().toISOString().replace('T', ' ').substring(0, 16);

                        await run_query("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [game_id, title, thumb, link, date_now, end_date_unix]);
                        new_deals.push({ title, link, thumb, store: "Epic Games", end_date: end_date_unix });
                    }
                }
            } catch (err) { console.error(err); }
        }
    } catch (err) { console.error(err.message); }

    return { new_deals, found_ids };
}

module.exports = scrape_epic;