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
(function () {
    'use strict';

    const LANGUAGES = [
        ['en', 'English'],
        ['fr', 'Français'],
        ['es', 'Español'],
        ['pt', 'Português'],
        ['de', 'Deutsch'],
        ['it', 'Italiano'],
        ['ru', 'Русский'],
    ];

    let csrf_token = null;
    let guilds = [];
    let selected_guild = null;
    let saving = false;

    function tr(key, fallback) {
        const value = window.FGDI18n ? window.FGDI18n.t(key) : key;
        return value === key ? fallback : value;
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

    function guild_icon_url(guild) {
        if (guild.icon && /^[A-Za-z0-9_]+$/.test(String(guild.icon))) {
            return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
        }
        return null;
    }

    function show_login_prompt(message) {
        const prompt = document.getElementById('dashboard-login-prompt');
        const content = document.getElementById('dashboard-content');
        if (prompt) {
            prompt.hidden = false;
            const text = prompt.querySelector('p');
            if (text && message) text.textContent = message;
        }
        if (content) content.hidden = true;
    }

    function show_content() {
        const prompt = document.getElementById('dashboard-login-prompt');
        const content = document.getElementById('dashboard-content');
        if (prompt) prompt.hidden = true;
        if (content) content.hidden = false;
    }

    function build_nav(user) {
        const nav = document.getElementById('user-nav');
        if (!nav || !user) return;

        const login = document.getElementById('dashboard-login');
        if (login) login.remove();

        const profile = document.createElement('div');
        profile.className = 'user-profile';

        const avatar = document.createElement('img');
        avatar.className = 'user-avatar';
        avatar.alt = 'Avatar';
        avatar.src = avatar_url(user);

        const name = document.createElement('span');
        name.className = 'user-name';
        name.textContent = String(user.username || 'Discord user');

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
    }

    function render_languages(select, selected) {
        select.replaceChildren();
        for (const [value, label] of LANGUAGES) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            option.selected = value === selected;
            select.appendChild(option);
        }
    }

    function render_roles(select, roles, selected) {
        select.replaceChildren();

        const everyone = document.createElement('option');
        everyone.value = 'everyone';
        everyone.textContent = '@everyone';
        everyone.selected = !selected || selected === 'everyone';
        select.appendChild(everyone);

        for (const role of roles || []) {
            const option = document.createElement('option');
            option.value = role.id;
            option.textContent = role.name;
            option.selected = role.id === selected;
            select.appendChild(option);
        }

        if (selected && selected !== 'everyone' && !(roles || []).some((role) => role.id === selected)) {
            const option = document.createElement('option');
            option.value = selected;
            option.textContent = selected;
            option.selected = true;
            select.appendChild(option);
        }
    }

    function render_guild_list() {
        const list = document.getElementById('dashboard-guild-list');
        const empty = document.getElementById('dashboard-no-guilds');
        if (!list) return;

        list.replaceChildren();

        if (guilds.length === 0) {
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;

        for (const guild of guilds) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'dashboard-guild';
            button.dataset.guildId = guild.id;
            button.setAttribute(
                'aria-pressed',
                selected_guild && selected_guild.id === guild.id ? 'true' : 'false'
            );

            const icon_url = guild_icon_url(guild);
            if (icon_url) {
                const img = document.createElement('img');
                img.src = icon_url;
                img.alt = '';
                img.loading = 'lazy';
                button.appendChild(img);
            } else {
                const fallback = document.createElement('span');
                fallback.className = 'dashboard-guild-fallback';
                fallback.textContent = String(guild.name || '?').slice(0, 1).toUpperCase();
                button.appendChild(fallback);
            }

            const name = document.createElement('span');
            name.textContent = guild.name;
            button.appendChild(name);

            button.addEventListener('click', () => select_guild(guild));
            list.appendChild(button);
        }
    }

    function select_guild(guild) {
        selected_guild = guild;

        const title = document.getElementById('dashboard-settings-title');
        const form = document.getElementById('dashboard-form');
        const status = document.getElementById('dashboard-status');
        if (title) title.textContent = guild.name;
        if (form) form.hidden = false;
        if (status) status.textContent = '';

        const language = document.getElementById('dashboard-language');
        const ping_role = document.getElementById('dashboard-ping-role');
        const steam = document.getElementById('dashboard-steam');
        const epic = document.getElementById('dashboard-epic');
        const gog = document.getElementById('dashboard-gog');

        if (language) render_languages(language, guild.settings.language);
        if (ping_role) render_roles(ping_role, guild.roles, guild.settings.ping_role);
        if (steam) steam.checked = Boolean(guild.settings.steam_on);
        if (epic) epic.checked = Boolean(guild.settings.epic_on);
        if (gog) gog.checked = Boolean(guild.settings.gog_on);

        render_guild_list();
    }

    function set_status(message, is_error) {
        const status = document.getElementById('dashboard-status');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-error', Boolean(is_error));
    }

    async function load_dashboard() {
        const response = await fetch('/api/dashboard', {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        });

        if (response.status === 401) {
            show_login_prompt();
            return;
        }

        let data = null;
        try {
            data = await response.json();
        } catch (_) {
            data = null;
        }

        if (response.status === 403 && data && data.reauth) {
            show_login_prompt(tr('dashboardReauth', 'Your Discord permissions are outdated. Please log in again.'));
            return;
        }

        if (!response.ok || !data) {
            show_login_prompt(tr('dashboardUnavailable', 'The dashboard is temporarily unavailable.'));
            return;
        }

        csrf_token = data.csrf_token;
        guilds = Array.isArray(data.guilds) ? data.guilds : [];

        show_content();
        render_guild_list();

        if (guilds.length > 0) {
            const first = guilds[0];
            select_guild(first);
        }
    }

    async function save_settings(event) {
        event.preventDefault();
        if (!selected_guild || saving) return;

        const language = document.getElementById('dashboard-language');
        const ping_role = document.getElementById('dashboard-ping-role');
        const steam = document.getElementById('dashboard-steam');
        const epic = document.getElementById('dashboard-epic');
        const gog = document.getElementById('dashboard-gog');
        const button = document.getElementById('dashboard-save');

        saving = true;
        if (button) button.disabled = true;
        set_status(tr('dashboardSaving', 'Saving...'), false);

        try {
            const response = await fetch(
                `/api/dashboard/guilds/${encodeURIComponent(selected_guild.id)}`,
                {
                    method: 'PATCH',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrf_token || '',
                    },
                    body: JSON.stringify({
                        language: language ? language.value : undefined,
                        ping_role: ping_role ? ping_role.value : undefined,
                        steam_on: steam ? steam.checked : undefined,
                        epic_on: epic ? epic.checked : undefined,
                        gog_on: gog ? gog.checked : undefined,
                    }),
                }
            );

            let data = null;
            try {
                data = await response.json();
            } catch (_) {
                data = null;
            }

            if (!response.ok || !data || !data.ok) {
                throw new Error((data && data.error) || 'save failed');
            }

            selected_guild.settings = data.settings;
            set_status(tr('dashboardSaved', 'Settings saved.'), false);
        } catch (error) {
            console.error('Dashboard save error:', error);
            set_status(tr('dashboardSaveError', 'Could not save the settings.'), true);
        } finally {
            saving = false;
            if (button) button.disabled = false;
        }
    }

    async function init() {
        const form = document.getElementById('dashboard-form');
        if (form) form.addEventListener('submit', save_settings);

        try {
            const response = await fetch('/api/user', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (!response.ok) throw new Error('auth check failed');
            const data = await response.json();
            if (!data.loggedIn || !data.user) {
                show_login_prompt();
                return;
            }
            build_nav(data.user);
        } catch (error) {
            console.error('Dashboard auth error:', error);
            show_login_prompt();
            return;
        }

        try {
            await load_dashboard();
        } catch (error) {
            console.error('Dashboard load error:', error);
            show_login_prompt(tr('dashboardUnavailable', 'The dashboard is temporarily unavailable.'));
        }
    }

    window.addEventListener('fgd:language', () => {
        if (selected_guild) {
            const status = document.getElementById('dashboard-status');
            if (status) status.textContent = '';
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();
