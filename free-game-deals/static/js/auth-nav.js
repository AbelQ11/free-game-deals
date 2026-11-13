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

    function build_profile(user) {
        const profile = document.createElement('div');
        profile.className = 'user-profile';

        const identity = document.createElement('a');
        identity.className = 'user-identity';
        identity.href = '/dashboard';
        identity.title = tr('dashboardLink', 'Dashboard');

        const avatar = document.createElement('img');
        avatar.className = 'user-avatar';
        avatar.alt = 'Avatar';
        avatar.src = avatar_url(user);

        const name = document.createElement('span');
        name.className = 'user-name';
        name.textContent = String(user.username || 'Discord user');

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
        return profile;
    }

    async function init() {
        const nav = document.getElementById('user-nav');
        if (!nav) return;

        const login = nav.querySelector('.auth-login');

        try {
            const response = await fetch('/api/user', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (!response.ok) throw new Error(`auth check failed (${response.status})`);

            const data = await response.json();
            if (!data.loggedIn || !data.user) {
                if (login) login.hidden = false;
                return;
            }

            if (login) login.remove();

            const dashboard = document.createElement('a');
            dashboard.href = '/dashboard';
            dashboard.className = 'nav-link';
            dashboard.dataset.i18n = 'dashboardLink';
            dashboard.textContent = tr('dashboardLink', 'Dashboard');

            nav.append(dashboard, build_profile(data.user));

            if (window.FGDI18n) window.FGDI18n.apply();
        } catch (error) {
            console.error('Auth navigation error:', error);
            if (login) login.hidden = false;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
