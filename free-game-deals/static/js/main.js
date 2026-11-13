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
const SUPPORTED_LANGS = ['en', 'fr', 'es', 'pt', 'de', 'it', 'ru'];

function set_lang_cookie(lang) {
    try {
        document.cookie = `fgd_lang=${encodeURIComponent(lang)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (_) {
        // Cookies can be unavailable in private browsing.
    }
}

let current_lang = 'en';
try {
    const stored_lang = localStorage.getItem('lang');
    if (SUPPORTED_LANGS.includes(stored_lang)) current_lang = stored_lang;
} catch (_) {
    // localStorage can be unavailable in private browsing.
}
set_lang_cookie(current_lang);
let games_data = [];

const STORE_HOSTS = ['steampowered.com', 'epicgames.com', 'gog.com'];
const IMAGE_HOSTS = [
    'steamstatic.com',
    'epicgames.com',
    'unrealengine.com',
    'gog-statics.com',
    'discordapp.com',
    'discord.com',
    'jsdelivr.net',
];
const CLOCK_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';

function host_matches(host, allowed_hosts) {
    const value = String(host || '').toLowerCase();
    return allowed_hosts.some(
        (allowed) => value === allowed || value.endsWith(`.${allowed}`)
    );
}

function safe_url(url, allowed_hosts) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '#';
        if (allowed_hosts && !host_matches(parsed.hostname, allowed_hosts)) return '#';
        if (parsed.protocol === 'http:') parsed.protocol = 'https:';
        return parsed.href;
    } catch (_) {
        return '#';
    }
}

function safe_image_url(url) {
    const value = safe_url(url, IMAGE_HOSTS);
    return value === '#' ? '/placeholder-game.jpg' : value;
}

function avatar_url(user) {
    const id = /^\d+$/.test(String(user.id || '')) ? String(user.id) : null;
    const avatar = /^[A-Za-z0-9_]+$/.test(String(user.avatar || ''))
        ? String(user.avatar)
        : null;

    if (id && avatar) {
        return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
    }
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
}

window.open_modal = function (type) {
    const modal = document.getElementById('legalModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');

    if (!modal || !titleEl || !bodyEl) return;

    const langObj = translations[current_lang] || translations['en'] || {};
    titleEl.textContent = langObj[type + 'Title'] || 'Notice';
    bodyEl.textContent = langObj[type + 'Body'] || 'Content coming soon...';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
};

window.close_modal = function () {
    const modal = document.getElementById('legalModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

async function init_app() {
    try {
        const config_res = await fetch('/api/config');
        if (!config_res.ok) throw new Error(`Config request failed (${config_res.status})`);

        const config = await config_res.json();
        translations = config.translations || {};

        document.querySelectorAll('.invite-link').forEach((link) => {
            link.href = safe_url(config.invite_url, ['discord.com']);
        });

        update_dropdown_ui(current_lang);
        apply_language(current_lang);

        if (window.FGDAds) window.FGDAds.init(config.ads);

        await checkUserLogin();
        await fetch_games();
    } catch (error) {
        console.error('Init error :', error);
    }
}

async function checkUserLogin() {
    const login = document.querySelector('#user-nav .auth-login');
    try {
        const response = await fetch('/api/user');
        if (!response.ok) throw new Error(`auth request failed (${response.status})`);

        const data = await response.json();
        if (!data.loggedIn || !data.user) {
            if (login) login.hidden = false;
            return;
        }

        const userNav = document.getElementById('user-nav');
        if (!userNav) return;

        if (login) login.remove();
        userNav.replaceChildren();

        const stats_link = document.createElement('a');
        stats_link.href = '/stats';
        stats_link.className = 'nav-link';
        stats_link.dataset.i18n = 'statsLink';
        stats_link.textContent =
            (translations[current_lang] && translations[current_lang].statsLink) || 'Stats';

        const dashboard_link = document.createElement('a');
        dashboard_link.href = '/dashboard';
        dashboard_link.className = 'nav-link';
        dashboard_link.dataset.i18n = 'dashboardLink';
        dashboard_link.textContent =
            (translations[current_lang] && translations[current_lang].dashboardLink) ||
            'Dashboard';

        const profile = document.createElement('div');
        profile.className = 'user-profile';

        const identity = document.createElement('a');
        identity.className = 'user-identity';
        identity.href = '/dashboard';
        identity.title =
            (translations[current_lang] && translations[current_lang].dashboardLink) ||
            'Dashboard';

        const avatar = document.createElement('img');
        avatar.className = 'user-avatar';
        avatar.alt = 'Avatar';
        avatar.src = avatar_url(data.user);

        const name = document.createElement('span');
        name.className = 'user-name';
        name.textContent = String(data.user.username || 'Discord user');

        identity.append(avatar, name);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/auth/logout';
        form.className = 'logout-form';

        const logout = document.createElement('button');
        logout.type = 'submit';
        logout.className = 'btn-logout';
        logout.dataset.i18n = 'logoutLink';
        logout.textContent =
            (translations[current_lang] && translations[current_lang].logoutLink) || 'Logout';

        form.appendChild(logout);
        profile.append(identity, form);
        userNav.append(stats_link, dashboard_link, profile);
    } catch (error) {
        console.error('Authentication check failed:', error);
        if (login) login.hidden = false;
    }
}

async function fetch_games() {
    try {
        const games_res = await fetch('/api/games');
        if (!games_res.ok) throw new Error(`Games request failed (${games_res.status})`);

        const data = await games_res.json();
        games_data = Array.isArray(data) ? data : [];
        render_games();
    } catch (error) {
        console.error('Error when getting games :', error);
    }
}

function has_end_date(game) {
    return Boolean(game && game.end_date && game.end_date !== 'null');
}

function store_badge(host) {
    if (host === 'steampowered.com' || host.endsWith('.steampowered.com')) {
        return { className: 'badge badge-steam', label: 'Steam' };
    }
    if (host === 'epicgames.com' || host.endsWith('.epicgames.com')) {
        return { className: 'badge badge-epic', label: 'Epic Games' };
    }
    if (host === 'gog.com' || host.endsWith('.gog.com')) {
        return { className: 'badge badge-gog', label: 'GOG.com' };
    }
    return null;
}

function button_key_for_host(host) {
    if (host === 'steampowered.com' || host.endsWith('.steampowered.com')) return 'viewSteam';
    if (host === 'epicgames.com' || host.endsWith('.epicgames.com')) return 'viewEpic';
    if (host === 'gog.com' || host.endsWith('.gog.com')) return 'viewGog';
    return 'viewOffer';
}

function render_games() {
    const grid = document.getElementById('games-grid');
    if (!grid) return;

    grid.replaceChildren();

    if (!games_data.length) {
        const empty = document.createElement('p');
        empty.id = 'loading-text';
        empty.dataset.i18n = 'noGamesMemory';
        empty.textContent =
            (translations[current_lang] && translations[current_lang].noGamesMemory) ||
            'No games in memory yet.';
        grid.appendChild(empty);
        render_preview(null);
        apply_language(current_lang);
        return;
    }

    for (const game of games_data) {
        const link = safe_url(game.link, STORE_HOSTS);
        let host = '';
        try {
            host = new URL(link).hostname.toLowerCase();
        } catch (_) {
            host = '';
        }

        const badge = store_badge(host);
        const card = document.createElement('article');
        card.className = 'card';

        const deal_path =
            game.id && /^[A-Za-z0-9_-]{1,120}$/.test(String(game.id))
                ? `/deal/${encodeURIComponent(String(game.id))}`
                : null;
        if (deal_path) {
            const overlay = document.createElement('a');
            overlay.className = 'card-link-overlay';
            overlay.href = deal_path;
            overlay.setAttribute(
                'aria-label',
                `View details for ${String(game.title || 'this game')}`
            );
            card.appendChild(overlay);
        }

        const image_wrapper = document.createElement('div');
        image_wrapper.className = 'img-wrapper';

        const image = document.createElement('img');
        image.src = safe_image_url(game.thumb);
        image.alt = `${String(game.title || 'Free game')} — free game cover`;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => { image.src = '/placeholder-game.jpg'; }, { once: true });
        image_wrapper.appendChild(image);

        if (badge) {
            const badge_el = document.createElement('span');
            badge_el.className = badge.className;
            badge_el.textContent = badge.label;
            image_wrapper.appendChild(badge_el);
        }

        const info = document.createElement('div');
        info.className = 'info';

        const title = document.createElement('h3');
        title.textContent = String(game.title || 'Unknown game');

        const description_text = String(game.description || '').trim();
        const description = document.createElement('p');
        description.className = 'card-description';
        if (description_text) {
            description.textContent =
                description_text.length > 180
                    ? `${description_text.slice(0, 179)}…`
                    : description_text;
        }

        const date = document.createElement('span');
        date.className = 'date';
        date.textContent = String(game.date || '');

        info.append(title);
        if (description_text) info.appendChild(description);
        info.appendChild(date);

        if (has_end_date(game)) {
            const end = document.createElement('span');
            end.className = 'end-date';
            end.innerHTML = CLOCK_ICON;
            const timestamp = document.createElement('span');
            timestamp.dataset.timestamp = String(game.end_date);
            end.appendChild(timestamp);
            info.appendChild(end);
        }

        const button = document.createElement('a');
        button.className = 'btn-card';
        button.href = link;
        if (link !== '#') {
            button.target = '_blank';
            button.rel = 'noopener noreferrer';
        }
        button.dataset.i18n = button_key_for_host(host);
        button.textContent =
            (translations[current_lang] && translations[current_lang][button.dataset.i18n]) ||
            'View Offer';
        info.appendChild(button);

        card.append(image_wrapper, info);
        grid.appendChild(card);
    }

    render_preview(games_data[0]);
    apply_language(current_lang);
}

function render_preview(game) {
    const img = document.getElementById('preview-img');
    const title = document.getElementById('preview-title');
    const end = document.getElementById('preview-end');
    if (!img || !title || !end) return;

    end.replaceChildren();
    end.hidden = true;

    if (!game) {
        img.src = '/placeholder-game.jpg';
        img.alt = '';
        title.textContent = 'Free Game Deals';
        return;
    }

    img.onerror = () => { img.onerror = null; img.src = '/placeholder-game.jpg'; };
    img.src = safe_image_url(game.thumb);
    img.alt = String(game.title || '');
    title.textContent = String(game.title || 'Free Game Deals');

    if (has_end_date(game)) {
        end.innerHTML = CLOCK_ICON;
        const timestamp = document.createElement('span');
        timestamp.dataset.timestamp = String(game.end_date);
        end.appendChild(timestamp);
        end.hidden = false;
    }
}

function apply_language(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            element.innerHTML = translations[lang][key];
        }
    });
    render_dates();
}

function render_dates() {
    const locale_map = {
        en: 'en-US',
        fr: 'fr-FR',
        es: 'es-ES',
        pt: 'pt-PT',
        de: 'de-DE',
        it: 'it-IT',
        ru: 'ru-RU',
    };
    const prefix_map = {
        en: 'Ends: ',
        fr: 'Fin : ',
        es: 'Termina: ',
        pt: 'Termina: ',
        de: 'Endet: ',
        it: 'Scade: ',
        ru: 'Конец: ',
    };
    const ended_prefix_map = {
        en: 'Ended: ',
        fr: 'Terminé : ',
        es: 'Terminó: ',
        pt: 'Terminou: ',
        de: 'Beendet: ',
        it: 'Terminato: ',
        ru: 'Завершено: ',
    };
    const locale = locale_map[current_lang] || 'en-US';

    document.querySelectorAll('[data-timestamp]').forEach((element) => {
        const timestamp_string = element.getAttribute('data-timestamp');
        if (!timestamp_string || timestamp_string === 'null') return;

        const timestamp = Number.parseInt(timestamp_string, 10);
        if (!Number.isFinite(timestamp)) return;

        const date = new Date(timestamp * 1000);
        const is_ended = timestamp < Math.floor(Date.now() / 1000);
        const prefix = is_ended
            ? ended_prefix_map[current_lang] || 'Ended: '
            : prefix_map[current_lang] || 'Ends: ';
        element.textContent = `${prefix} ${date.toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })}`;
    });
}

function update_dropdown_ui(lang_code) {
    const selected_lang_text = document.getElementById('selected-lang-text');
    if (selected_lang_text) selected_lang_text.innerText = lang_code.toUpperCase();
    document.querySelectorAll('.dropdown-options li').forEach((option) => {
        option.classList.toggle('active', option.getAttribute('data-value') === lang_code);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const privacyLink = document.querySelector('[data-umami-event="open-privacy"]');
    const tosLink = document.querySelector('[data-umami-event="open-tos"]');
    const closeBtn = document.querySelector('.close');

    if (privacyLink) {
        privacyLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open_modal('privacy');
        });
    }

    if (tosLink) {
        tosLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open_modal('tos');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.close_modal());
    }

    window.addEventListener('click', (event) => {
        const modal = document.getElementById('legalModal');
        if (event.target === modal) window.close_modal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') window.close_modal();
    });

    const lang_dropdown = document.getElementById('lang-dropdown');
    if (lang_dropdown) {
        lang_dropdown.addEventListener('click', (event) => {
            event.stopPropagation();
            lang_dropdown.classList.toggle('active');
        });

        document.querySelectorAll('.dropdown-options li').forEach((option) => {
            option.addEventListener('click', (event) => {
                const new_lang = event.target.getAttribute('data-value');
                if (!SUPPORTED_LANGS.includes(new_lang)) return;
                current_lang = new_lang;
                try {
                    localStorage.setItem('lang', new_lang);
                } catch (_) {
                }
                set_lang_cookie(new_lang);
                update_dropdown_ui(new_lang);
                apply_language(new_lang);
            });
        });

        document.addEventListener('click', () => lang_dropdown.classList.remove('active'));
    }

    document.querySelectorAll('.accordion-header').forEach((header) => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const content = item.querySelector('.accordion-content');
            const is_active = item.classList.contains('active');

            document.querySelectorAll('.accordion-item').forEach((other) => {
                other.classList.remove('active');
                const other_header = other.querySelector('.accordion-header');
                if (other_header) other_header.setAttribute('aria-expanded', 'false');
                const other_content = other.querySelector('.accordion-content');
                if (other_content) other_content.style.maxHeight = null;
            });

            if (!is_active) {
                item.classList.add('active');
                header.setAttribute('aria-expanded', 'true');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });

    init_app();
});
