const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const ejs = require('ejs');
const path = require('path');

const app = express();
const PORT = 5000;
const DB_NAME = "deals_memory.db";

app.use('/static', express.static(path.join(__dirname, 'static')));

const CLIENT_ID = CLIENT_ID;
const INVITE_LINK = INVITE_LINK;
const BOT_IMAGE_URL = "/static/favicon.jpg";

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
    <title>Free Game Deals</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/png" href="<%= bot_thumb %>">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' https://cloud.umami.is;">
    <script async src="https://cloud.umami.is/script.js" data-website-id="54e060b3-c121-47b0-917d-9ecfe4444320"></script>
    <style>
        :root {
            --primary: #66c0f4;
            --accent: #5865F2;
            --bg: #0b0e14;
            --card-bg: #151a24;
            --text: #e0e6ed;
            --text-muted: #8899a6;
            --border: #2d3748;
            --nav-bg: rgba(11, 14, 20, 0.95);
            --shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
        [data-theme="light"] {
            --primary: #0078d4;
            --accent: #5865F2;
            --bg: #f3f4f6;
            --card-bg: #ffffff;
            --text: #1f2937;
            --text-muted: #6b7280;
            --border: #e5e7eb;
            --nav-bg: rgba(255, 255, 255, 0.95);
            --shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        * { box-sizing: border-box; transition: background-color 0.3s, color 0.3s, border-color 0.3s; }
        body { background-color: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; margin: 0; padding-top: 80px; }
        .container { max-width: 1100px; margin: auto; padding: 0 20px; }
        nav {
            position: fixed; top: 0; left: 0; right: 0; height: 70px;
            background: var(--nav-bg); backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--border);
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 5%; z-index: 1000;
        }
        .logo { font-weight: 700; font-size: 1.5em; color: var(--primary); text-decoration: none; display: flex; align-items: center; gap: 10px; }
        .nav-items { display: flex; align-items: center; gap: 15px; }
        .btn {
            padding: 10px 20px; border-radius: 8px; font-weight: 600; text-decoration: none;
            cursor: pointer; border: none; display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.2s, background-color 0.3s, color 0.3s;
        }
        .btn:hover { transform: translateY(-2px); }
        .btn-discord { background: var(--accent); color: white; }
        .btn-theme { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 12px; font-size: 1.2em; cursor: pointer; }
        .btn-icon-img {
            width: 24px; height: 24px; border-radius: 50%; margin-right: 10px; object-fit: cover; border: 2px solid rgba(255,255,255,0.3);
        }
        header { text-align: center; padding: 60px 20px; }
        h1 { font-size: 3em; margin: 0 0 10px; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { color: var(--text-muted); font-size: 1.2em; margin-bottom: 30px; }
        .setup-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 30px; margin: 40px auto; max-width: 800px; text-align: center; box-shadow: var(--shadow); }
        .steps { display: flex; flex-wrap: wrap; justify-content: center; gap: 30px; margin-top: 20px; }
        .step { flex: 1; min-width: 200px; }
        .step strong { color: var(--primary); display: block; margin-bottom: 5px; }
        .step p { color: var(--text-muted); font-size: 0.9em; margin: 0; }
        .section-title { text-align: center; font-size: 2em; margin: 60px 0 30px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 25px; }
        .card { background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: var(--shadow); }
        .card:hover { transform: translateY(-5px); border-color: var(--primary); }
        
        .img-wrapper { position: relative; }
        .card img { width: 100%; height: 150px; object-fit: cover; display: block; }
        .badge { position: absolute; top: 10px; right: 10px; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.6); }
        .badge-steam { background: rgba(27, 40, 56, 0.95); color: #66c0f4; border: 1px solid #66c0f4; }
        .badge-epic { background: rgba(255, 255, 255, 0.95); color: #000000; border: 1px solid #ffffff; }
        .badge-gog { background: rgba(193, 49, 143, 0.95); color: #ffffff; border: 1px solid #ffffff; }

        .info { padding: 20px; flex-grow: 1; display: flex; flex-direction: column; }
        .info h3 { margin: 0 0 10px; font-size: 1.1em; }
        .date { color: var(--text-muted); font-size: 0.8em; margin-bottom: auto; }
        .end-date { color: var(--primary); font-size: 0.85em; font-weight: bold; margin-top: 5px; margin-bottom: 5px; }
        
        .btn-steam { margin-top: 15px; display: block; text-align: center; background: rgba(102, 192, 244, 0.15); color: var(--primary); border: 1px solid var(--primary); }
        .btn-steam:hover { background: var(--primary); color: white; }
        .btn-epic { margin-top: 15px; display: block; text-align: center; background: rgba(255, 255, 255, 0.1); color: var(--text); border: 1px solid var(--border); }
        .btn-epic:hover { background: var(--text); color: var(--bg); }
        .btn-gog { margin-top: 15px; display: block; text-align: center; background: rgba(193, 49, 143, 0.15); color: #c1318f; border: 1px solid #c1318f; }
        .btn-gog:hover { background: #c1318f; color: white; }

        footer { margin-top: 80px; padding: 40px; text-align: center; border-top: 1px solid var(--border); color: var(--text-muted); }
        .credits { color: var(--primary); font-weight: bold; }
        .footer-links { margin-top: 15px; }
        .footer-links a { color: var(--text-muted); text-decoration: none; margin: 0 10px; font-size: 0.85em; cursor: pointer; }
        .footer-links a:hover { color: var(--primary); }
        .modal { display: none; position: fixed; z-index: 2000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); backdrop-filter: blur(5px); }
        .modal-content { background-color: var(--card-bg); margin: 10% auto; padding: 30px; border: 1px solid var(--border); width: 80%; max-width: 600px; border-radius: 15px; color: var(--text); line-height: 1.6; position: relative; }
        .close { color: var(--text-muted); float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
        @media (max-width: 600px) { .nav-items span { display: none; } h1 { font-size: 2em; } }
    </style>
</head>
<body>
    <nav>
        <a href="#" class="logo">Free Game Deals</a>
        <div class="nav-items">
            <button class="btn btn-theme" id="lang-toggle">🇬🇧</button>
            <button class="btn btn-theme" id="theme-toggle">☀️</button>
            <a href="<%= invite_url %>" target="_blank" class="btn btn-discord">
                <img src="<%= bot_thumb %>" class="btn-icon-img">
                <span data-i18n="navAdd">Ajouter</span>
            </a>
        </div>
    </nav>
    <div class="container">
        <header>
            <h1 data-i18n="mainTitle">Jeux Gratuits en Temps Réel</h1>
            <p class="subtitle" data-i18n="subtitle">Le bot qui scanne Steam, Epic Games & GOG pour vous.</p>
            <a href="<%= invite_url %>" data-umami-event="invite-bot-click" target="_blank" class="btn btn-discord" style="padding: 15px 30px; font-size: 1.1em;">
                <img src="<%= bot_thumb %>" class="btn-icon-img" style="width: 30px; height: 30px;">
                <span data-i18n="inviteBtn">Inviter le Bot sur mon Serveur</span>
            </a>
        </header>
        <section class="setup-box">
            <h2 data-i18n="setupTitle">🚀 Installation Rapide</h2>
            <div class="steps">
                <div class="step"><strong data-i18n="step1Title">1. Invitation</strong><p data-i18n="step1Desc">Cliquez sur "Inviter" et choisissez votre serveur.</p></div>
                <div class="step"><strong data-i18n="step2Title">2. Salon</strong><p data-i18n="step2Desc">Créez un salon textuel nommé <code>free-games</code>.</p></div>
                <div class="step"><strong data-i18n="step3Title">3. Profitez</strong><p data-i18n="step3Desc">Le bot postera les jeux dès qu'ils sont détectés.</p></div>
            </div>
        </section>
        <h2 class="section-title" data-i18n="historyTitle">🔥 Historique des trouvailles</h2>
        <div class="grid">
        <% if (games.length > 0) { %>
            <% games.forEach(function(game) { %>
                <div class="card">
                    <div class="img-wrapper">
                        <img src="<%= game.thumb %>" alt="Cover">
                        <% if (game.link.includes('steampowered.com')) { %>
                            <span class="badge badge-steam">Steam</span>
                        <% } else if (game.link.includes('epicgames.com')) { %>
                            <span class="badge badge-epic">Epic</span>
                        <% } else if (game.link.includes('gog.com')) { %>
                            <span class="badge badge-gog">GOG.com</span>
                        <% } %>
                    </div>
                    <div class="info">
                        <h3><%= game.title %></h3>
                        <span class="date">📅 <%= game.date %></span>
                        <% if (game.end_date && game.end_date !== 'null') { %>
                            <span class="end-date" data-timestamp="<%= game.end_date %>"></span>
                        <% } %>
                        
                        <% if (game.link.includes('steampowered.com')) { %>
                            <a href="<%= game.link %>" target="_blank" class="btn btn-steam" data-i18n="viewSteam">Voir sur Steam</a>
                        <% } else if (game.link.includes('epicgames.com')) { %>
                            <a href="<%= game.link %>" target="_blank" class="btn btn-epic" data-i18n="viewEpic">Voir sur Epic Games</a>
                        <% } else if (game.link.includes('gog.com')) { %>
                            <a href="<%= game.link %>" target="_blank" class="btn btn-gog" data-i18n="viewGog">Voir sur GOG</a>
                        <% } else { %>
                            <a href="<%= game.link %>" target="_blank" class="btn btn-steam" data-i18n="viewOffer">Voir l'offre</a>
                        <% } %>
                    </div>
                </div>
            <% }); %>
        <% } else { %>
            <p style="text-align: center; width: 100%; color: var(--text-muted);" data-i18n="scanning">Scan en cours... Revenez plus tard !</p>
        <% } %>
        </div>
        <footer>
            <p>&copy; 2026 Free Game Deals Project</p>
            <p><span data-i18n="creditsPrefix">Créé avec passion par</span> <span class="credits">Daith_42</span> & <span class="credits">Kiliotsu</span></p>
            <div class="footer-links">
                <a onclick="openModal('privacy')" data-i18n="privacyLink">Privacy Policy</a>
                <a onclick="openModal('tos')" data-i18n="tosLink">Terms of Service</a>
            </div>
        </footer>
    </div>
    <div id="legalModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <h2 id="modalTitle"></h2>
            <div id="modalBody"></div>
        </div>
    </div>
    <script>
        const toggleBtn = document.getElementById('theme-toggle');
        const html = document.documentElement;
        const savedTheme = localStorage.getItem('theme') || 'dark';
        html.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
        toggleBtn.addEventListener('click', () => {
            const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
        function updateThemeIcon(theme) { toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙'; }
        
        const translations = {
            fr: {
                flag: "🇬🇧", navAdd: "Ajouter", mainTitle: "Jeux Gratuits en Temps Réel",
                subtitle: "Le bot qui scanne Steam, Epic Games & GOG pour vous.", inviteBtn: "Inviter le Bot sur mon Serveur",
                setupTitle: "🚀 Installation Rapide", step1Title: "1. Invitation", step1Desc: 'Cliquez sur "Inviter" et choisissez votre serveur.',
                step2Title: "2. Salon", step2Desc: "Créez un salon textuel nommé <code>free-games</code>.",
                step3Title: "3. Profitez", step3Desc: "Le bot postera les jeux dès qu'ils sont détectés.",
                historyTitle: "🔥 Historique des trouvailles", viewSteam: "Voir sur Steam", viewEpic: "Voir sur Epic Games", viewGog: "Voir sur GOG",
                viewOffer: "Voir l'offre", scanning: "Scan en cours... Revenez plus tard !", creditsPrefix: "Créé avec passion par",
                privacyLink: "Politique de Confidentialité", tosLink: "Conditions d'Utilisation", privacyTitle: "Politique de Confidentialité",
                privacyBody: "Nous collectons uniquement l'ID de votre serveur. Statistiques anonymes via Umami.",
                tosTitle: "Conditions d'Utilisation", tosBody: "Bot fourni gratuitement. Nous ne sommes pas responsables des changements de prix."
            },
            en: {
                flag: "🇫🇷", navAdd: "Add Bot", mainTitle: "Real-Time Free Games",
                subtitle: "The bot that scans Steam, Epic Games & GOG for you.", inviteBtn: "Invite the Bot to my Server",
                setupTitle: "🚀 Quick Setup", step1Title: "1. Invite", step1Desc: 'Click "Invite" and choose your server.',
                step2Title: "2. Channel", step2Desc: "Create a text channel named <code>free-games</code>.",
                step3Title: "3. Enjoy", step3Desc: "The bot will post games as soon as they are detected.",
                historyTitle: "🔥 Find History", viewSteam: "View on Steam", viewEpic: "View on Epic Games", viewGog: "View on GOG",
                viewOffer: "View Offer", scanning: "Scan in progress... Check back later!", creditsPrefix: "Created with passion by",
                privacyLink: "Privacy Policy", tosLink: "Terms of Service", privacyTitle: "Privacy Policy",
                privacyBody: "We only collect your Server ID. Anonymous stats via Umami.",
                tosTitle: "Terms of Service", tosBody: "Bot provided for free. We are not responsible for price changes."
            }
        };
        const langBtn = document.getElementById('lang-toggle');
        let currentLang = localStorage.getItem('lang') || 'fr';
        
        function renderDates() {
            document.querySelectorAll('.end-date').forEach(el => {
                const tsStr = el.getAttribute('data-timestamp');
                if (tsStr && tsStr !== 'None' && tsStr !== 'null') {
                    const ts = parseInt(tsStr) * 1000;
                    if (!isNaN(ts)) {
                        const date = new Date(ts);
                        const options = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
                        const locale = currentLang === 'fr' ? 'fr-FR' : 'en-US';
                        const formatted = date.toLocaleDateString(locale, options);
                        el.innerHTML = \`⏳ \${currentLang === 'fr' ? 'Fin : ' : 'Ends: '} \${formatted}\`;
                    }
                }
            });
        }

        function applyLanguage(lang) {
            document.documentElement.lang = lang;
            langBtn.textContent = translations[lang].flag;
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (translations[lang][key]) el.innerHTML = translations[lang][key];
            });
            renderDates();
        }
        langBtn.addEventListener('click', () => {
            currentLang = currentLang === 'fr' ? 'en' : 'fr';
            localStorage.setItem('lang', currentLang);
            applyLanguage(currentLang);
        });
        function openModal(type) {
            document.getElementById('modalTitle').innerText = translations[currentLang][type + 'Title'];
            document.getElementById('modalBody').innerText = translations[currentLang][type + 'Body'];
            document.getElementById('legalModal').style.display = "block";
        }
        function closeModal() { document.getElementById('legalModal').style.display = "none"; }
        window.onclick = function(event) { if (event.target == document.getElementById('legalModal')) closeModal(); }
        applyLanguage(currentLang);
    </script>
</body>
</html>
`;

const db = new sqlite3.Database(DB_NAME, (err) => {
    if (err) console.error("Erreur de base de données:", err.message);
});

app.get('/', (req, res) => {
    db.all("SELECT * FROM sent_deals ORDER BY date DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).send(`Erreur : ${err.message}`);
        }
        try {
            const renderedHtml = ejs.render(HTML_TEMPLATE, {
                games: rows,
                invite_url: INVITE_LINK,
                bot_thumb: BOT_IMAGE_URL
            });
            res.send(renderedHtml);
        } catch (renderErr) {
            res.status(500).send(`Erreur de rendu HTML : ${renderErr.message}`);
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Le serveur web Node.js tourne sur le port ${PORT}`);
});
