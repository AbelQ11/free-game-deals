let translations = {};
let currentLang = localStorage.getItem('lang') || 'en';
let gamesData = [];

async function initApp() {
    try {
        const configRes = await fetch('/api/config');
        const config = await configRes.json();
        translations = config.translations;

        document.querySelectorAll('.invite-link').forEach(link => link.href = config.invite_url);

        const langSelect = document.getElementById('lang-select');
        if(langSelect) langSelect.value = currentLang;
        applyLanguage(currentLang);

        await fetchGames();
    } catch (error) {
        console.error("Erreur d'initialisation :", error);
    }
}

async function fetchGames() {
    try {
        const gamesRes = await fetch('/api/games');
        gamesData = await gamesRes.json();
        renderGames();
    } catch (error) {
        console.error("Erreur de récupération des jeux :", error);
    }
}

function renderGames() {
    const grid = document.getElementById('games-grid');
    if (!gamesData || gamesData.length === 0) return;

    grid.innerHTML = '';

    gamesData.forEach(game => {
        let badgeHtml = '';
        let btnI18nKey = 'viewOffer';

        if (game.link.includes('steampowered.com')) {
            badgeHtml = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/steam.svg" alt="Steam" style="width: 14px; height: 14px; filter: invert(1);"> Steam</span>`;
            btnI18nKey = 'viewSteam';
        } else if (game.link.includes('epicgames.com')) {
            badgeHtml = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/epicgames.svg" alt="Epic Games" style="width: 14px; height: 14px; filter: invert(1);"> Epic Games</span>`;
            btnI18nKey = 'viewEpic';
        } else if (game.link.includes('gog.com')) {
            badgeHtml = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/gogdotcom.svg" alt="GOG" style="width: 14px; height: 14px; filter: invert(1);"> GOG.com</span>`;
            btnI18nKey = 'viewGog';
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="img-wrapper">
                <img src="${game.thumb}" alt="Cover">
                ${badgeHtml}
            </div>
            <div class="info">
                <h3>${game.title}</h3>
                <span class="date">${game.date}</span>
                ${game.end_date && game.end_date !== 'null' ? `<span class="end-date" data-timestamp="${game.end_date}"></span>` : ''}
                <a href="${game.link}" target="_blank" class="btn-card" data-i18n="${btnI18nKey}">View Offer</a>
            </div>
        `;
        grid.appendChild(card);
    });

    applyLanguage(currentLang);
}

function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.innerHTML = translations[lang][key];
        }
    });
    renderDates();
}

function renderDates() {
    document.querySelectorAll('.end-date').forEach(el => {
        const tsStr = el.getAttribute('data-timestamp');
        if (tsStr && tsStr !== 'None' && tsStr !== 'null') {
            const ts = parseInt(tsStr) * 1000;
            if (!isNaN(ts)) {
                const date = new Date(ts);
                const options = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

                const localeMap = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES', 'de': 'de-DE', 'it': 'it-IT', 'ru': 'ru-RU' };
                const locale = localeMap[currentLang] || 'en-US';

                const prefixMap = { 'en': 'Ends: ', 'fr': 'Fin : ', 'es': 'Termina: ', 'de': 'Endet: ', 'it': 'Scade: ', 'ru': 'Конец: ' };
                const prefix = prefixMap[currentLang] || 'Ends: ';

                const formatted = date.toLocaleDateString(locale, options);
                el.innerHTML = `⏳ ${prefix} ${formatted}`;
            }
        }
    });
}

document.getElementById('lang-select')?.addEventListener('change', (e) => {
    currentLang = e.target.value;
    localStorage.setItem('lang', currentLang);
    applyLanguage(currentLang);
});

window.openModal = function(type) {
    document.getElementById('modalTitle').innerText = translations[currentLang][type + 'Title'];
    document.getElementById('modalBody').innerText = translations[currentLang][type + 'Body'];
    document.getElementById('legalModal').style.display = "block";
}

window.closeModal = function() {
    document.getElementById('legalModal').style.display = "none";
}

window.onclick = function(event) {
    if (event.target == document.getElementById('legalModal')) closeModal();
}

// Lancement au chargement de la page
initApp();