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

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetch_with_retry(url, options = {}, attempts = 3) {
    let last_error;

    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const { headers: extra_headers, ...rest } = options;
            return await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'en-US',
                    ...(extra_headers || {}),
                },
                ...rest,
            });
        } catch (error) {
            last_error = error;
            const status = error.response ? error.response.status : null;

            // Do not retry client errors other than rate limiting.
            if (status && status !== 429 && status < 500) break;
            if (attempt < attempts - 1) await sleep(500 * 2 ** attempt);
        }
    }

    throw last_error;
}

module.exports = { fetch_with_retry, USER_AGENT };
