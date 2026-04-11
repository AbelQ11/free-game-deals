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

window.open_modal = function(type) {
    const modal = document.getElementById('legalModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');

    if (!modal || !titleEl || !bodyEl) return;

    const langObj = translations[current_lang] || translations['en'] || {};

    const title = langObj[type + 'Title'] || "Notice";
    let body = langObj[type + 'Body'] || "Content coming soon...";

    body = body.replace(/\n/g, '<br>');

    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    modal.style.display = "block";
    document.body.style.overflow = 'hidden';
};

window.close_modal = function() {
    const modal = document.getElementById('legalModal');
    if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = 'auto';
    }
};

function safe_url(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '#';
        return parsed.href;
    } catch {
        return '#';
    }
}

async function init_app() {
    try {
        const config_res = await fetch('/api/config');
        const config = await config_res.json();
        translations = config.translations;

        document.querySelectorAll('.invite-link').forEach(link => link.href = safe_url(config.invite_url));

        update_dropdown_ui(current_lang);
        apply_language(current_lang);

        await checkUserLogin();
        await fetch_games();
    } catch (error) {
        console.error("Init error :", error);
    }
}

async function checkUserLogin() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();

        if (data.loggedIn) {
            const userNav = document.getElementById('user-nav');
            if (userNav) {
                const avatarUrl = `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png`;
                userNav.innerHTML = `
                    <div class="user-profile">
                        <img src="${avatarUrl}" alt="Avatar" class="user-avatar">
                        <span class="user-name">${data.user.username}</span>
                        <a href="/auth/logout" class="btn-logout">Logout</a>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error("Authentication check failed:", error);
    }
}

async function fetch_games() {
    try {
        const games_res = await fetch('/api/games');
        games_data = await games_res.json();
        render_games();
    } catch (error) {
        console.error("Error when getting games :", error);
    }
}

function render_games() {
    const grid = document.getElementById('games-grid');
    if (!grid || !games_data || games_data.length === 0) return;

    grid.innerHTML = '';

    games_data.forEach(game => {
        let badge_html = '';
        let btn_i18n_key = 'viewOffer';

        if (game.link.includes('steampowered.com')) {
            badge_html = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/steam.svg" alt="Steam" style="width: 14px; height: 14px; filter: invert(1);"> Steam</span>`;
            btn_i18n_key = 'viewSteam';
        } else if (game.link.includes('epicgames.com')) {
            badge_html = `<span class="badge"><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/epicgames.svg" alt="Epic" style="width: 14px; height: 14px; filter: invert(1);"> Epic Games</span>`;
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
                <a href="${safe_url(game.link)}" target="_blank" rel="noopener noreferrer" class="btn-card" data-i18n="${btn_i18n_key}">View Offer</a>
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
        if (ts_str && ts_str !== 'null') {
            const ts = parseInt(ts_str) * 1000;
            const date = new Date(ts);
            const locale_map = { 'en': 'en-US', 'fr': 'fr-FR', 'es': 'es-ES', 'pt': 'pt-PT', 'de': 'de-DE', 'it': 'it-IT', 'ru': 'ru-RU' };
            const prefix_map = { 'en': 'Ends: ', 'fr': 'Fin : ', 'es': 'Termina: ', 'pt': 'Termina: ', 'de': 'Endet: ', 'it': 'Scade: ', 'ru': 'Конец: ' };
            const locale = locale_map[current_lang] || 'en-US';
            const prefix = prefix_map[current_lang] || 'Ends: ';
            el.textContent = `⏳ ${prefix} ${date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
        }
    });
}

function update_dropdown_ui(lang_code) {
    const selected_lang_text = document.getElementById('selected-lang-text');
    if (selected_lang_text) selected_lang_text.innerText = lang_code.toUpperCase();
    document.querySelectorAll('.dropdown-options li').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('data-value') === lang_code);
    });
}

document.addEventListener('DOMContentLoaded', () => {

    const privacyLink = document.querySelector('[data-umami-event="open-privacy"]');
    const tosLink = document.querySelector('[data-umami-event="open-tos"]');
    const closeBtn = document.querySelector('.close');

    if (privacyLink) {
        privacyLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.open_modal('privacy');
        });
    }

    if (tosLink) {
        tosLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.open_modal('tos');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            window.close_modal();
        });
    }

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('legalModal');
        if (e.target === modal) window.close_modal();
    });

    const lang_dropdown = document.getElementById('lang-dropdown');
    if (lang_dropdown) {
        lang_dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            lang_dropdown.classList.toggle('active');
        });

        document.querySelectorAll('.dropdown-options li').forEach(option => {
            option.addEventListener('click', (e) => {
                const new_lang = e.target.getAttribute('data-value');
                current_lang = new_lang;
                localStorage.setItem('lang', new_lang);
                update_dropdown_ui(new_lang);
                apply_language(new_lang);
            });
        });
        document.addEventListener('click', () => lang_dropdown.classList.remove('active'));
    }

    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const content = item.querySelector('.accordion-content');
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.accordion-item').forEach(other => {
                other.classList.remove('active');
                other.querySelector('.accordion-content').style.maxHeight = null;
            });
            if (!isActive) {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });

    init_app();
});