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
const { fetch_with_retry } = require('./http');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
} = require('../lib/sanitize');

const EPIC_URL =
    'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions' +
    '?locale=en-US&country=US&allowCountries=US';

function get_active_promotion(game, now_ms) {
    const groups = game?.promotions?.promotionalOffers || [];
    for (const group of groups) {
        for (const offer of group?.promotionalOffers || []) {
            const start = Date.parse(offer.startDate);
            const end = Date.parse(offer.endDate);
            if (Number.isFinite(start) && Number.isFinite(end) && start <= now_ms && now_ms < end) {
                return offer;
            }
        }
    }
    return null;
}

async function scrape_epic() {
    const found = new Map();
    let complete = true;

    try {
        const response = await fetch_with_retry(EPIC_URL);
        const elements = response.data?.data?.Catalog?.searchStore?.elements;

        if (!Array.isArray(elements)) {
            throw new Error('Unexpected Epic API response');
        }

        const now_ms = Date.now();

        for (const game of elements) {
            try {
                const price = game?.price?.totalPrice;
                if (!price || Number(price.discountPrice) !== 0) continue;

                const promotion = get_active_promotion(game, now_ms);
                if (!promotion) continue;

                const game_id = `epic_${game.id}`;
                if (!game.id || found.has(game_id)) continue;

                const slug =
                    game.catalogNs?.mappings?.[0]?.pageSlug ||
                    game.productSlug ||
                    game.urlSlug;
                if (!slug) continue;

                const title = clean_text(game.title, 200);
                if (!title) continue;

                const link = safe_link(`https://store.epicgames.com/p/${slug}`);
                if (!link) continue;

                const images = Array.isArray(game.keyImages) ? game.keyImages : [];
                const preferred_images = images.filter(
                    (item) => item.type === 'OfferImageWide' || item.type === 'Thumbnail'
                );
                const thumb =
                    preferred_images.map((item) => safe_image(item.url)).find(Boolean) ||
                    images.map((item) => safe_image(item.url)).find(Boolean) ||
                    null;

                const end_date = Math.floor(Date.parse(promotion.endDate) / 1000);
                if (!Number.isFinite(end_date)) continue;

                found.set(game_id, {
                    id: game_id,
                    title,
                    link,
                    thumb,
                    description: clean_description(
                        game.description || game.shortDescription || ''
                    ),
                    store: 'Epic Games',
                    end_date,
                });
            } catch (error) {
                console.error('Epic game parse error:', error.message);
                complete = false;
            }
        }

        return {
            store: 'Epic Games',
            ok: complete,
            found_ids: [...found.keys()],
            new_deals: [...found.values()],
        };
    } catch (error) {
        console.error('Epic scan error:', error.message);
        return { store: 'Epic Games', ok: false, found_ids: [], new_deals: [] };
    }
}

module.exports = scrape_epic;
