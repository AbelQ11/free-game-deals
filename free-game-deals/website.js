const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const langData = require('./lang.json');

const app = express();
const PORT = 5000;
const DB_NAME = path.join(__dirname, "deals_memory.db");

app.use(helmet({ contentSecurityPolicy: false }));

const db = new sqlite3.Database(DB_NAME, (err) => {
    if (err) console.error("Erreur de base de données:", err.message);
});

app.get('/sitemap.xml', (req, res) => {
    const domain = "https://free-game-deals.duckdns.org";
    db.get("SELECT date FROM sent_deals ORDER BY date DESC LIMIT 1", [], (err, row) => {
        let lastModDate = new Date().toISOString().split('T')[0];
        if (!err && row && row.date) lastModDate = row.date.split(' ')[0];

        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
   <url>
      <loc>${domain}/</loc>
      <lastmod>${lastModDate}</lastmod>
      <changefreq>hourly</changefreq>
      <priority>1.0</priority>
   </url>
</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(sitemapXml);
    });
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Sitemap: https://free-game-deals.duckdns.org/sitemap.xml`);
});


const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP. Please retry in 15min."
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'static')));

const CLIENT_ID = "1466415254203404433";
const INVITE_LINK = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=4503601775012880&integration_type=0&scope=bot`;
const BOT_IMAGE_URL = "/favicon.jpg";

app.get('/api/config', (req, res) => {
    res.json({
        invite_url: INVITE_LINK,
        bot_thumb: BOT_IMAGE_URL,
        translations: langData
    });
});

app.get('/api/games', (req, res) => {
    db.all("SELECT * FROM sent_deals ORDER BY date DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur API Node.js tourne sur le port ${PORT}`);
});