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

const GOG_CATALOG_URL = 'https://catalog.gog.com/v1/catalog';
const GOG_DESCRIPTION_URL = 'https://api.gog.com/products';
const GOG_PAGE_SIZE = 50;
const GOG_MAX_PAGES = Math.max(1, Math.min(Number(process.env.GOG_MAX_PAGES) || 20, 40));
const GOG_DESCRIPTION_LIMIT = Math.max(
    1,
    Math.min(Number(process.env.GOG_DESCRIPTION_LIMIT) || 40, 100)
);

const NON_GAME_TITLE =
    /(demo|prologue|playtest|soundtrack|artbook|art book|season pass|expansion pass|upgrade pack)/i;

/**
 * A free GOG catalog entry is only interesting when it is a real game whose
 * regular price is above zero. The API returns hundreds of permanently free
 * demos/DLC with `baseMoney.amount = 0`, so filtering on "final price is 0"
 * alone would spam the channel.
 */
function normalize_product(product) {
    if (!product) return null;

    const type = String(product.productType || '').toLowerCase();
    if (!['game', 'pack'].includes(type)) return null;

    const final_amount = Number(product.price?.finalMoney?.amount);
    const base_amount = Number(product.price?.baseMoney?.amount);
    if (!Number.isFinite(final_amount) || final_amount !== 0) return null;

    const discount = String(product.price?.discount || '');
    const looks_like_giveaway = /^-?100/.test(discount);

    if (!(base_amount > 0) && !looks_like_giveaway) return null;

    const title = clean_text(product.title, 200);
    if (!title || NON_GAME_TITLE.test(title)) return null;

    const slug = clean_text(product.slug, 200);
    if (!slug) return null;

    const link =
        safe_link(product.storeLink) ||
        safe_link(`https://www.gog.com/en/game/${slug}`);
    if (!link) return null;

    const thumb =
        safe_image(product.coverHorizontal) ||
        safe_image(product.coverVertical) ||
        safe_image(product.logo);

    return {
        id: `gog_${product.id || slug}`,
        title,
        link,
        thumb,
        description: '',
        store: 'GOG',
        end_date: null,
    };
}

async function fetch_gog_description(product_id) {
    if (!product_id) return '';

    try {
        const url =
            `${GOG_DESCRIPTION_URL}/${encodeURIComponent(product_id)}` +
            '?expand=description';
        const response = await fetch_with_retry(url);
        const description = response.data?.description;

        if (typeof description === 'string') {
            return clean_description(description);
        }

        return clean_description(
            description?.lead || description?.full || response.data?.short_description || ''
        );
    } catch (error) {
        console.warn(`GOG description fetch failed for ${product_id}: ${error.message}`);
        return '';
    }
}

async function scrape_gog() {
    const found = new Map();
    const source_ids = new Map();
    let complete = true;

    try {
        for (let page = 1; page <= GOG_MAX_PAGES; page++) {
            const url =
                `${GOG_CATALOG_URL}?limit=${GOG_PAGE_SIZE}&page=${page}` +
                '&countryCode=US&currencyCode=USD&locale=en-US' +
                '&price=between:0,0&order=desc:releaseDate';

            const response = await fetch_with_retry(url);
            const products = response.data?.products;

            if (!Array.isArray(products)) {
                throw new Error('Unexpected GOG API response');
            }
            if (products.length === 0) break;

            for (const product of products) {
                try {
                    const deal = normalize_product(product);
                    if (deal && !found.has(deal.id)) {
                        found.set(deal.id, deal);
                        source_ids.set(deal.id, product.id);
                    }
                } catch (error) {
                    console.error('GOG product parse error:', error.message);
                    complete = false;
                }
            }

            const total_pages = Number(response.data?.pages) || page;
            if (page >= total_pages) break;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // Descriptions are only available through the product endpoint, so
        // enrich the free games after the catalog scan (bounded on purpose).
        let enriched = 0;
        for (const [deal_id, deal] of found) {
            if (enriched >= GOG_DESCRIPTION_LIMIT) break;
            deal.description = await fetch_gog_description(source_ids.get(deal_id));
            enriched += 1;
            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        return {
            store: 'GOG',
            ok: complete,
            found_ids: [...found.keys()],
            new_deals: [...found.values()],
        };
    } catch (error) {
        console.error('GOG scan error:', error.message);
        return { store: 'GOG', ok: false, found_ids: [], new_deals: [] };
    }
}

module.exports = scrape_gog;
module.exports.normalize_product = normalize_product;
module.exports.fetch_gog_description = fetch_gog_description;
