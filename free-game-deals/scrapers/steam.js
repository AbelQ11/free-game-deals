const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' };
const COOKIES = 'steamCountry=FR|00; birthtime=946684801';

async function scrape_steam(run_query) {
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

                        await run_query("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [game_id, title, thumb, link, date_now, null]);
                        new_deals.push({ title, link, thumb, store: "Steam", end_date: null });
                    }
                }
            } catch (err) { console.error(err); }
        }
    } catch (err) { console.error("Steam Error:", err.message); }

    return { new_deals, found_ids };
}

module.exports = scrape_steam;