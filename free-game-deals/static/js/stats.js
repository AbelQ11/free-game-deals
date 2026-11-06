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
function tr(key, fallback) {
    const value = window.FGDI18n ? window.FGDI18n.t(key) : key;
    return value === key ? fallback : value;
}

function open_modal(type) {
    const modal = document.getElementById('legalModal');
    const title_el = document.getElementById('modalTitle');
    const body_el = document.getElementById('modalBody');
    if (!modal || !title_el || !body_el) return;

    title_el.textContent = tr(`${type}Title`, 'Notice');
    body_el.textContent = tr(`${type}Body`, 'Content coming soon...');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function close_modal() {
    const modal = document.getElementById('legalModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function avatar_url(user) {
    const id = /^\d+$/.test(String(user.id || '')) ? String(user.id) : null;
    const avatar = /^[A-Za-z0-9_]+$/.test(String(user.avatar || ''))
        ? String(user.avatar)
        : null;

    if (id && avatar) {
        return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
    }
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function build_stats_nav() {
    const nav = document.getElementById('user-nav');
    if (!nav) return;

    nav.replaceChildren();

    const home = document.createElement('a');
    home.href = '/';
    home.className = 'nav-link';
    home.dataset.i18n = 'homeLink';
    home.textContent = tr('homeLink', 'Home');

    const stats = document.createElement('a');
    stats.href = '/stats';
    stats.className = 'nav-link';
    stats.dataset.i18n = 'statsLink';
    stats.setAttribute('aria-current', 'page');
    stats.textContent = tr('statsLink', 'Stats');

    nav.append(home, stats);
    return nav;
}

async function check_user_login() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) return;
        const data = await response.json();
        if (!data.loggedIn || !data.user) return;

        const nav = build_stats_nav();
        if (!nav) return;

        const profile = document.createElement('div');
        profile.className = 'user-profile';

        const avatar = document.createElement('img');
        avatar.className = 'user-avatar';
        avatar.alt = 'Avatar';
        avatar.src = avatar_url(data.user);

        const name = document.createElement('span');
        name.className = 'user-name';
        name.textContent = String(data.user.username || 'Discord user');

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/auth/logout';
        form.className = 'logout-form';

        const logout = document.createElement('button');
        logout.type = 'submit';
        logout.className = 'btn-logout';
        logout.dataset.i18n = 'logoutLink';
        logout.textContent = tr('logoutLink', 'Logout');

        form.appendChild(logout);
        profile.append(avatar, name, form);
        nav.appendChild(profile);
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

function format_number(value) {
    return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function animate_value(id, start, end, duration) {
    const element = document.getElementById(id);
    if (!element) return;

    const target = Number(end) || 0;
    const first = Number(start) || 0;
    if (first === target) {
        element.textContent = format_number(target);
        return;
    }

    const started_at = performance.now();
    const difference = target - first;

    function frame(now) {
        const progress = Math.min((now - started_at) / duration, 1);
        const value = Math.round(first + difference * (1 - Math.pow(1 - progress, 3)));
        element.textContent = format_number(value);
        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            element.textContent = format_number(target);
        }
    }

    requestAnimationFrame(frame);
}

async function fetch_stats() {
    const updated = document.getElementById('stats-updated');

    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error(`Stats request failed (${response.status})`);

        const stats = await response.json();
        const stores = stats.stores || { steam: 0, epic: 0, gog: 0 };

        animate_value('stat-servers', 0, stats.total_servers, 900);
        animate_value('stat-games', 0, stats.total_games, 1100);

        let top_store = 'Steam';
        let top_count = Number(stores.steam) || 0;
        if ((Number(stores.epic) || 0) > top_count) {
            top_store = 'Epic Games';
            top_count = Number(stores.epic) || 0;
        }
        if ((Number(stores.gog) || 0) > top_count) {
            top_store = 'GOG';
            top_count = Number(stores.gog) || 0;
        }

        const top_el = document.getElementById('stat-top-store');
        if (top_el) top_el.textContent = `${top_store} (${format_number(top_count)})`;

        if (updated) {
            const date = stats.updated_at ? new Date(stats.updated_at) : new Date();
            const lang = window.FGDI18n ? window.FGDI18n.getLang() : 'en';
            const locales = {
                en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT',
                de: 'de-DE', it: 'it-IT', ru: 'ru-RU',
            };
            updated.textContent = `${tr('statsUpdated', 'Live statistics · updated')} ${date.toLocaleString(locales[lang] || 'en-US')}`;
        }
    } catch (error) {
        console.error('Could not load stats:', error);
        if (updated) updated.textContent = tr('statsUnavailable', 'Statistics are temporarily unavailable.');
    }
}

function wire_modal() {
    document.querySelectorAll('[data-modal]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            open_modal(link.getAttribute('data-modal'));
        });
    });

    const close_button = document.querySelector('.close');
    if (close_button) {
        close_button.addEventListener('click', close_modal);
        close_button.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                close_modal();
            }
        });
    }

    const modal = document.getElementById('legalModal');
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close_modal();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close_modal();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    wire_modal();
    check_user_login();
    fetch_stats();
});

window.addEventListener('fgd:language', () => {
    check_user_login();
    fetch_stats();
});
