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

    const dashboard = document.createElement('a');
    dashboard.href = '/dashboard';
    dashboard.className = 'nav-link';
    dashboard.dataset.i18n = 'dashboardLink';
    dashboard.textContent = tr('dashboardLink', 'Dashboard');

    nav.append(home, stats, dashboard);
    return nav;
}

async function check_user_login() {
    const login = document.querySelector('#user-nav .auth-login');
    try {
        const response = await fetch('/api/user');
        if (!response.ok) throw new Error(`auth request failed (${response.status})`);
        const data = await response.json();
        if (!data.loggedIn || !data.user) {
            if (login) login.hidden = false;
            return;
        }

        const nav = build_stats_nav();
        if (!nav) return;

        const profile = document.createElement('div');
        profile.className = 'user-profile';

        const identity = document.createElement('a');
        identity.className = 'user-identity';
        identity.href = '/dashboard';
        identity.title = tr('dashboardLink', 'Dashboard');

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
        logout.textContent = tr('logoutLink', 'Logout');

        form.appendChild(logout);
        profile.append(identity, form);
        nav.appendChild(profile);
    } catch (error) {
        console.error('Auth check failed:', error);
        if (login) login.hidden = false;
    }
}

function format_number(value) {
    return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

const STORE_DEFINITIONS = [
    { key: 'steam', label: 'Steam', color: 'var(--store-steam)' },
    { key: 'epic', label: 'Epic Games', color: 'var(--store-epic)' },
    { key: 'gog', label: 'GOG', color: 'var(--store-gog)' },
];

let store_stats = {
    history: { steam: 0, epic: 0, gog: 0 },
    active: { steam: 0, epic: 0, gog: 0 },
};
let chart_mode = 'history';

function render_store_chart() {
    const container = document.getElementById('store-chart');
    const empty = document.getElementById('store-chart-empty');
    if (!container) return;

    const stores = store_stats[chart_mode] || { steam: 0, epic: 0, gog: 0 };
    const total = STORE_DEFINITIONS.reduce(
        (sum, store) => sum + (Number(stores[store.key]) || 0),
        0
    );

    container.replaceChildren();

    if (total <= 0) {
        if (empty) empty.hidden = false;
        container.setAttribute('aria-label', tr('statsStoreChartEmpty', 'No data yet.'));
        return;
    }

    if (empty) empty.hidden = true;
    const summary = STORE_DEFINITIONS.map(
        (store) => `${store.label}: ${format_number(stores[store.key])}`
    ).join(', ');
    container.setAttribute('aria-label', summary);

    for (const store of STORE_DEFINITIONS) {
        const count = Number(stores[store.key]) || 0;
        const percent = total > 0 ? (count / total) * 100 : 0;

        const row = document.createElement('div');
        row.className = 'store-chart-row';

        const label = document.createElement('span');
        label.className = 'store-chart-label';
        label.textContent = store.label;

        const track = document.createElement('div');
        track.className = 'store-chart-track';
        const fill = document.createElement('span');
        fill.className = 'store-chart-fill';
        fill.style.width = `${percent.toFixed(2)}%`;
        fill.style.background = store.color;
        track.appendChild(fill);

        const value = document.createElement('span');
        value.className = 'store-chart-value';
        value.textContent = `${format_number(count)} · ${percent.toFixed(0)}%`;

        row.append(label, track, value);
        container.appendChild(row);
    }
}

function set_chart_mode(mode) {
    if (!['history', 'active'].includes(mode)) return;
    chart_mode = mode;

    const history_button = document.getElementById('chart-history');
    const active_button = document.getElementById('chart-active');
    if (history_button) {
        history_button.classList.toggle('is-active', mode === 'history');
        history_button.setAttribute('aria-pressed', mode === 'history' ? 'true' : 'false');
    }
    if (active_button) {
        active_button.classList.toggle('is-active', mode === 'active');
        active_button.setAttribute('aria-pressed', mode === 'active' ? 'true' : 'false');
    }

    render_store_chart();
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
        const active_stores = stats.active_stores || { steam: 0, epic: 0, gog: 0 };

        store_stats = { history: stores, active: active_stores };
        render_store_chart();

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
    set_chart_mode('history');
    const history_button = document.getElementById('chart-history');
    const active_button = document.getElementById('chart-active');
    if (history_button) history_button.addEventListener('click', () => set_chart_mode('history'));
    if (active_button) active_button.addEventListener('click', () => set_chart_mode('active'));
    check_user_login();
    fetch_stats();
});

window.addEventListener('fgd:language', () => {
    check_user_login();
    fetch_stats();
});
