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
let translations = {};
let current_lang = localStorage.getItem('lang') || 'en';
let games_data = [];

async function init_app() {
    try {
        const config_res = await fetch('/api/config');
        const config = await config_res.json();
        translations = config.translations;

        document.querySelectorAll('.invite-link').forEach(link => link.href = config.invite_url);


        update_dropdown_ui(current_lang);
        apply_language(current_lang);

        await fetch_games();
    } catch (error) {
        console.error("Erreur d'initialisation :", error);
    }
}

async function fetch_games() {
    try {
        const games_res = await fetch('/api/games');
        games_data = await games_res.json();
        render_games();
    } catch (error) {
        console.error("Erreur de récupération des jeux :", error);
    }
}

function render_games() {
    const grid = document.getElementById('games-grid');
    if (!games_data || games_data.length === 0) return;

    grid.innerHTML = '';

    games_data.forEach(game => {
        let badge_html = '';
        let btn_i18n_key = 'viewOffer';

        if (game.link.includes('steampowered.com')) {
            badge_html = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/steam.svg" alt="Steam" style="width: 14px; height: 14px; filter: invert(1);"> Steam</span>`;
            btn_i18n_key = 'viewSteam';
        } else if (game.link.includes('epicgames.com')) {
            badge_html = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/epicgames.svg" alt="Epic Games" style="width: 14px; height: 14px; filter: invert(1);"> Epic Games</span>`;
            btn_i18n_key = 'viewEpic';
        } else if (game.link.includes('gog.com')) {
            badge_html = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/gogdotcom.svg" alt="GOG" style="width: 14px; height: 14px; filter: invert(1);"> GOG.com</span>`;
            btn_i18n_key = 'viewGog';
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="img-wrapper">
                <img src="${game.thumb}" alt="Cover">
                ${badge_html}
            </div>
            <div class="info">
                <h3>${game.title}</h3>
                <span class="date">${game.date}</span>
                ${game.end_date && game.end_date !== 'null' ? `<span class="end-date" data-timestamp="${game.end_date}"></span>` : ''}
                <a href="${game.link}" target="_blank" class="btn-card" data-i18n="${btn_i18n_key}">View Offer</a>
            </div>
        `;
        grid.appendChild(card);
    });

    apply_language(current_lang);
}

function apply_language(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.innerHTML = translations[lang][key];
        }
    });
    render_dates();
}

function render_dates() {
    document.querySelectorAll('.end-date').forEach(el => {
        const ts_str = el.getAttribute('data-timestamp');
        if (ts_str && ts_str !== 'None' && ts_str !== 'null') {
            const ts = parseInt(ts_str) * 1000;
            if (!isNaN(ts)) {
                const date = new Date(ts);
                const options = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

                const locale_map = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES', 'pt': 'pt-PT', 'de': 'de-DE', 'it': 'it-IT', 'ru': 'ru-RU' };
                const locale = locale_map[current_lang] || 'en-US';

                const prefix_map = { 'en': 'Ends: ', 'fr': 'Fin : ', 'es': 'Termina: ', 'pt': 'Termina: ', 'de': 'Endet: ', 'it': 'Scade: ', 'ru': 'Конец: ' };
                const prefix = prefix_map[current_lang] || 'Ends: ';

                const formatted = date.toLocaleDateString(locale, options);
                el.innerHTML = `⏳ ${prefix} ${formatted}`;
            }
        }
    });
}

const lang_dropdown = document.getElementById('lang-dropdown');
const selected_lang_text = document.getElementById('selected-lang-text');
const options = document.querySelectorAll('.dropdown-options li');

if (lang_dropdown) {
    lang_dropdown.addEventListener('click', (e) => {
        e.stopPropagation(); // Empêche le clic de se propager
        lang_dropdown.classList.toggle('active');
    });

    options.forEach(option => {
        option.addEventListener('click', (e) => {
            const new_lang = e.target.getAttribute('data-value');

            if (selected_lang_text) {
                selected_lang_text.innerText = new_lang.toUpperCase();
            }

            current_lang = new_lang;
            localStorage.setItem('lang', current_lang);
            apply_language(current_lang);

            options.forEach(opt => opt.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    document.addEventListener('click', () => {
        lang_dropdown.classList.remove('active');
    });
}

function update_dropdown_ui(lang_code) {
    if (!options || options.length === 0) return;
    options.forEach(opt => {
        opt.classList.remove('active');
        if (opt.getAttribute('data-value') === lang_code) {
            opt.classList.add('active');
            if (selected_lang_text) {
                selected_lang_text.innerText = lang_code.toUpperCase();
            }
        }
    });
}

window.open_modal = function(type) {
    document.getElementById('modalTitle').innerText = translations[current_lang][type + 'Title'];
    document.getElementById('modalBody').innerText = translations[current_lang][type + 'Body'];
    document.getElementById('legalModal').style.display = "block";
}

window.close_modal = function() {
    document.getElementById('legalModal').style.display = "none";
}

window.onclick = function(event) {
    if (event.target == document.getElementById('legalModal')) close_modal();
}

init_app();