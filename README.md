# Free Game Deals

Free-game-deals is an automated ecosystem designed to detect paid games that temporarily become free on Steam, the Epic Games Store, and GOG. The project combines a real-time monitoring Discord bot and a modern web interface to track the history of these offers.

## Features

* **Multi-Store Real-Time Scan:** Direct monitoring of Steam search pages (Scraping), the Epic Games public API, and GOG's catalog API to detect 100% discounts or $0.00 prices. GOG results are filtered to real games whose regular price is above zero, so demos, DLC and permanently free titles are ignored.
* **Game Descriptions:** Each detected game also stores a short description fetched from the Steam app details API, the Epic Games promotion API, or the GOG product API. Descriptions are shown on the website and in Discord embeds.
* **Multi-Server Discord Notifications:** Automatically alerts all servers using the bot in a dedicated channel named `#free-games`. It features dynamic embeds (colors changing based on the store), game descriptions and localized end-date timestamps.
* **Web Dashboard & Discord Auth:** A multilingual (EN, FR, ES, PT, DE, IT, RU) site built with Express/Node.js. Users can log in with Discord OAuth2 (`identify guilds`) to open a dashboard listing every server where they have **Manage Server** or **Administrator**, then change the bot language, the role to ping and the enabled stores. All settings are stored in SQLite and shared with the Discord bot.
* **Modern Design:** Fully responsive, mobile-friendly dark theme with dynamic store badges and automatic timezone conversion for offer end dates. Uses privacy-respecting analytics via Umami.
* **Statistics:** A `/stats` page with live counters, a per-store bar chart (history and active deals), and the top store.
* **Tested:** Node.js built-in tests cover sanitization, GOG filtering, rendering helpers and dashboard permission checks. GitHub Actions runs the test suite and a syntax check on every push/PR.
* **Ad Ready:** Google AdSense support with a GDPR-friendly consent banner, the AdSense account verification meta tag on every page, optional manual ad units or Auto Ads, and an ad-blocker notice that never appears when ads are disabled or consent was rejected.
* **Secure:** Deployed via an Nginx Reverse Proxy with HTTPS (SSL) encryption provided by Certbot, plus Helmet CSP, rate limiting, a SQLite session store, and sanitized store data.

---

## Technologies Used

* **Language:** JavaScript (Node.js)
* **Discord Bot:** `discord.js`
* **Web Server & Auth:** `express`, `express-session`, `passport`, `passport-discord`
* **Scraping / API Requests:** `axios`, `cheerio`
* **Database:** `sqlite3`
* **Security:** `helmet`, `express-rate-limit`, `compression`
* **Advertising:** Google AdSense (verification meta tag, Auto Ads, optional manual units)
* **Process Manager:** `pm2`
* **Infrastructure:** Oracle Cloud (Ubuntu VM)
* **DNS & SSL:** DuckDNS & Let's Encrypt (Certbot)

---

## File Structure

```text
├── free_game_deals_bot.js  # Discord bot entry point
├── website.js              # Express entry point
├── bot/
│   ├── context.js          # Discord client, database and shared constants
│   ├── commands.js         # Slash commands and interaction handling
│   ├── scan.js             # Scrapers orchestration and alert sending
│   ├── embeds.js           # Embed builders and translation helper
│   ├── owner.js            # Owner DM/log notifications
│   ├── settings.js         # Scan timestamps and guild count
│   ├── guilds.js           # Guild/role registry for the dashboard
│   └── cleanup.js          # Expired Discord message cleanup
├── routes/
│   ├── api.js              # /api/games, /api/stats, /api/config, /api/user
│   ├── auth.js             # Discord OAuth2 and session login
│   ├── pages.js            # /, /stats, /deal, sitemap, RSS
│   ├── dashboard.js        # /dashboard page
│   └── dashboard-api.js    # Authenticated dashboard API
├── lib/
│   ├── config.js           # Environment configuration and validation
│   ├── db.js               # Shared SQLite helpers, schema and migrations
│   ├── lang.js             # Loads every lang/*.json file
│   ├── render.js           # Server-side HTML rendering
│   ├── sanitize.js         # URL/text sanitization for scraped data
│   └── session-store.js    # SQLite-backed express-session store
├── lang/                   # Translation strings, one file per language
│   ├── en.json
│   ├── fr.json
│   ├── es.json
│   ├── pt.json
│   ├── de.json
│   ├── it.json
│   └── ru.json
├── scrapers/
│   ├── http.js             # Shared HTTP client with retries/timeouts
│   ├── steam.js            # Steam store scanner
│   ├── epic_games.js       # Epic Games Store scanner
│   └── gog.js              # GOG.com scanner
├── test/                   # Node.js test suite
├── templates/
│   └── deal.html           # Server-rendered SEO deal detail page
└── static/                 # Frontend web files served by Express
    ├── index.html          # Main website interface
    ├── stats.html          # Global statistics page
    ├── dashboard.html      # Authenticated server dashboard
    ├── favicon.jpg         # Bot's custom icon and website favicon
    ├── og-image.jpg        # Social preview image (Open Graph / Twitter)
    ├── css/
    │   ├── style.css       # Main stylesheet
    │   ├── stats.css       # Statistics page styles
    │   ├── dashboard.css   # Dashboard styles
    │   └── variables.css   # Theme colors and CSS variables
    └── js/
        ├── main.js         # Frontend logic (API fetching, auth UI, translations)
        ├── stats.js        # Statistics page and chart logic
        ├── dashboard.js    # Dashboard logic
        └── ads.js          # AdSense loader, cookie consent and adblock notice
```

---

## How to Use

1. **Invite the Bot:** Use the invite button available on the web dashboard.
2. **Configure the channel:** Create a text channel named exactly `free-games` on your Discord server.
3. **Reception:** As soon as a game is detected as free, the bot will post a detailed embed with the store link, the game's cover image, and the exact date and time the offer ends.

---

## Commands

* `/list` - Show the games that are currently free in the database memory.

**Admin-Only Commands:**
* `/scan` - Force the bot to scan all stores (global cooldown of 15min). The bot owner also receives private Discord DMs with the scan start time, a completion summary (duration, new games, messages sent and error count), and the user/server/channel that triggered the scan. Blocked attempts (cooldown, permission, scan already running) are also reported.

> Owner notifications use the Discord application owner automatically. Set `OWNER_ID` in `.env` to force a specific Discord user ID.
* `/lang` - Change the bot's notification language for your specific server.
* `/role` - Change the role that is mentioned when a game is free (defaults to `@everyone`).
* `/toggle` - Enable or disable notifications for specific stores (e.g., turn off Steam, keep Epic).

---

## Network & SSL Configuration

* The project uses a DuckDNS domain name linked to the Oracle Cloud VM's public IP.
* Security is ensured by an HTTP to HTTPS redirection rule generated by Certbot.

---

## Localhost Development

If you want to install the code and run it locally on your machine:

1. Clone the repository and install dependencies:
   ```bash
   cd free-game-deals
   npm install
   ```
2. Setup your environment variables:
   ```bash
   cp .env.example .env
   ```
   *(Fill in your Discord Bot Token, Client ID, Client Secret, callback URL and a random `SESSION_SECRET` of at least 32 characters.)*
3. Start the Web Server and the Bot (in two terminals):
   ```bash
   npm run start:web
   ```
   ```bash
   npm run start:bot
   ```

You can now view the website by navigating to `http://localhost:5000` in your browser.

### Tests and CI

Run the test suite locally:

```bash
npm test
```

The suite uses Node.js' built-in test runner and does not need a database or Discord connection. GitHub Actions runs `npm test` plus a syntax check on every push and pull request via `.github/workflows/ci.yml`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | Public URL used for sitemap, robots, OAuth redirects and Discord buttons. |
| `TRUST_PROXY` | Set to `1` when running behind Nginx/Caddy/Cloudflare. |
| `SESSION_SECRET` | Random secret for session cookies (32+ characters in production). |
| `CLIENT_ID`, `CLIENT_SECRET`, `CALLBACK_URL` | Discord OAuth2 credentials. |
| `DISCORD_TOKEN` | Bot token (only needed by `free_game_deals_bot.js`). |
| `OWNER_ID` | Discord user ID that receives manual `/scan` notifications. |
| `OWNER_LOG_CHANNEL_ID` | Optional private channel ID where owner notifications are also posted and the owner is mentioned. |
| `STEAM_COUNTRY` | Steam store country used by the scraper (default `US`). |
| `GOG_MAX_PAGES` | How many pages of the GOG free catalog to scan (default `20`). |
| `STEAM_DESCRIPTION_LIMIT`, `GOG_DESCRIPTION_LIMIT` | Maximum number of store descriptions fetched per scan (default `40`). |
| `ADSENSE_CLIENT` | AdSense client ID, e.g. `ca-pub-7079129901617673`. |
| `ADSENSE_SLOT_HEADER`, `ADSENSE_SLOT_INFEED`, `ADSENSE_SLOT_FOOTER` | Optional manual AdSense unit IDs. Leave empty to use Auto Ads. |

## Advertising

The website ships with a GDPR-friendly Google AdSense integration:

* Every page includes `<meta name="google-adsense-account" content="ca-pub-7079129901617673">`.
* Ad scripts are **not loaded** until the visitor clicks **Accept** in the cookie banner.
* The choice is stored in `localStorage` and can be changed through the **Cookie settings** footer link.
* With only `ADSENSE_CLIENT` configured, AdSense Auto Ads handles placement.
* To use fixed units, create them in AdSense and put their slot IDs in the `ADSENSE_SLOT_*` variables.

The privacy policy in `lang/en.json` documents the advertising cookies used by Google AdSense.

> Ads will only render after the site/domain has been approved in the AdSense dashboard. If the account is not approved yet, the consent banner still works and the ad slots stay hidden.

> For EEA/UK traffic, Google may require a Google-certified consent management platform (CMP). The built-in banner blocks ad scripts until opt-in, but if AdSense reports a CMP requirement, enable Google Funding Choices in your AdSense account and swap the custom banner for Google's CMP.

## Search engine optimisation

* Canonical URLs are generated from `BASE_URL`; `/index.html` and `/stats.html` permanently redirect to `/` and `/stats`.
* The homepage renders the latest 12 deals server-side, so titles, images and links are crawlable before JavaScript runs.
* Every deal has a dedicated `/deal/:id` page with its own title, description, canonical URL, Open Graph tags and `Product`/`Offer` + `BreadcrumbList` JSON-LD.
* `sitemap.xml` lists the homepage, the statistics page and up to 500 deal pages with per-deal `lastmod` values.
* `robots.txt` allows public pages and blocks `/api/` and `/auth/`.
* `/feed.xml` exposes the 50 latest deals as an RSS 2.0 feed.
* The homepage includes Open Graph, Twitter Card, JSON-LD (`WebSite`, `Organization`, `WebApplication`, `FAQPage`) and a generated 1200×630 `og-image.jpg`.
* The statistics page has its own title, description, canonical URL, JSON-LD `WebPage`/`BreadcrumbList`, and a `/api/stats` endpoint.
* `site.webmanifest` provides PWA metadata, and `/api/*`/`/auth/*` responses send `X-Robots-Tag: noindex, nofollow`.

---

## Issues Nomenclature

If you have a need to setup an issue, please follow this nomenclature:

`
ISS for the issue
`

`
IMP for potential improvement
`

Don't forget to add the following label !

---

## Credits

Created with passion by:
* [Daith_42](https://github.com/Daith-42)
* [Kiliotsu](https://github.com/AbelQ11)
