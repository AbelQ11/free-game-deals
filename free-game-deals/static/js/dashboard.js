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

    const LOCALES = {
        en: 'en-US',
        fr: 'fr-FR',
        es: 'es-ES',
        pt: 'pt-PT',
        de: 'de-DE',
        it: 'it-IT',
        ru: 'ru-RU',
    };

    let csrf_token = null;
    let guilds = [];
    let selected_guild = null;
    let saving = false;
    let dashboard_status = null;
    let status_updated_at = 0;
    let status_timeout = null;
    let scan_request_pending = false;

    function tr(key, fallback) {
        const value = window.FGDI18n ? window.FGDI18n.t(key) : key;
        return value === key ? fallback : value;
    }

    function current_locale() {
        const lang = window.FGDI18n ? window.FGDI18n.getLang() : 'en';
        return LOCALES[lang] || 'en-US';
    }

    function format_number(value) {
        return new Intl.NumberFormat(current_locale()).format(Number(value) || 0);
    }

    function format_date(value) {
        if (!value) return tr('dashboardStatusNever', 'Never');
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return tr('dashboardStatusNever', 'Never');
        const date_part = date.toLocaleDateString(current_locale(), {
            dateStyle: 'medium',
        });
        const time_part = date.toLocaleTimeString(current_locale(), {
            timeStyle: 'short',
        });
        return `${date_part}\n${time_part}`;
    }

    function format_duration(milliseconds) {
        const total_seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
        const minutes = Math.floor(total_seconds / 60);
        const seconds = total_seconds % 60;
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    function is_recent(value, max_age_ms = 120000) {
        if (!value) return false;
        const date = Date.parse(value);
        return Number.isFinite(date) && Date.now() - date < max_age_ms;
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

        if (
            selected &&
            selected !== 'everyone' &&
            !(roles || []).some((role) => role.id === selected)
        ) {
            const option = document.createElement('option');
            option.value = selected;
            option.textContent = selected;
            option.selected = true;
            select.appendChild(option);
        }
    }

    function render_channels(select, channels, selected) {
        select.replaceChildren();

        const default_option = document.createElement('option');
        default_option.value = '';
        default_option.textContent = tr('dashboardChannelDefault', 'Default (#free-games)');
        default_option.selected = !selected;
        select.appendChild(default_option);

        for (const channel of channels || []) {
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = `#${channel.name}`;
            option.selected = channel.id === selected;
            select.appendChild(option);
        }

        if (selected && !(channels || []).some((channel) => channel.id === selected)) {
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
        const channel = document.getElementById('dashboard-channel');
        const steam = document.getElementById('dashboard-steam');
        const epic = document.getElementById('dashboard-epic');
        const gog = document.getElementById('dashboard-gog');

        if (language) render_languages(language, guild.settings.language);
        if (ping_role) render_roles(ping_role, guild.roles, guild.settings.ping_role);
        if (channel) render_channels(channel, guild.channels, guild.settings.channel_id);
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

    function set_scan_message(message, is_error) {
        const element = document.getElementById('dashboard-scan-message');
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', Boolean(is_error));
    }

    function set_scan_state(message) {
        const element = document.getElementById('dashboard-scan-state');
        if (element) element.textContent = message;
    }

    function update_status_display() {
        const status = dashboard_status;
        if (!status) return;

        const last_scan = document.getElementById('dashboard-last-scan');
        const active_games = document.getElementById('dashboard-active-games');
        const last_errors = document.getElementById('dashboard-last-errors');
        const updated = document.getElementById('dashboard-status-updated');
        const button = document.getElementById('dashboard-scan-button');

        if (last_scan) last_scan.textContent = format_date(status.last_scan_at);
        if (active_games) active_games.textContent = format_number(status.active_games);
        if (last_errors) {
            last_errors.textContent = format_number(
                Array.isArray(status.last_scan?.errors)
                    ? status.last_scan.errors.length
                    : 0
            );
        }

        const new_deals = document.getElementById('dashboard-last-new-deals');
        if (new_deals) {
            new_deals.textContent = format_number(status.last_scan?.new_deals || 0);
        }

        const messages = document.getElementById('dashboard-last-messages');
        if (messages) {
            messages.textContent = format_number(status.last_scan?.messages_sent || 0);
        }

        const duration = document.getElementById('dashboard-last-duration');
        if (duration) {
            duration.textContent = status.last_scan?.duration_ms
                ? format_duration(status.last_scan.duration_ms)
                : '—';
        }

        if (updated) {
            updated.textContent = `${tr('dashboardStatusUpdated', 'Updated')} ${new Date().toLocaleTimeString(
                current_locale()
            )}`;
        }

        const download = document.getElementById('dashboard-download-errors');
        if (download) download.hidden = !status.can_scan;

        const errors_details = document.getElementById('dashboard-errors-details');
        const errors_list = document.getElementById('dashboard-errors-list');
        const scan_errors = Array.isArray(status.last_scan?.errors)
            ? status.last_scan.errors
            : [];
        if (errors_details) {
            const was_hidden = errors_details.hidden;
            const show = Boolean(status.can_scan) && scan_errors.length > 0;
            errors_details.hidden = !show;
            if (show && was_hidden) errors_details.open = true;
        }
        if (errors_list) {
            errors_list.textContent = scan_errors.length
                ? scan_errors.map((error, index) => `${index + 1}. ${error}`).join('\n\n')
                : '';
        }

        const latest = status.latest_request;
        const cooldown = Math.max(
            0,
            (Number(status.cooldown_remaining_ms) || 0) - (Date.now() - status_updated_at)
        );
        const running = Boolean(status.scan_in_progress) || latest?.status === 'running';
        const queued = latest?.status === 'pending';

        let state = '';
        if (running) {
            state = tr('dashboardScanRunning', 'Scan in progress...');
        } else if (queued) {
            state = tr('dashboardScanQueued', 'Scan queued...');
        } else if (cooldown > 0) {
            state = tr('dashboardScanCooldown', 'Next scan available in {time}.').replace(
                '{time}',
                format_duration(cooldown)
            );
        } else if (latest?.status === 'failed' && is_recent(latest.finished_at)) {
            state = `${tr('dashboardScanFailed', 'Scan failed.')} ${
                latest.reason ? String(latest.reason).slice(0, 200) : ''
            }`;
        } else if (latest?.status === 'done' && is_recent(latest.finished_at)) {
            state = tr('dashboardScanDone', 'Scan finished.');
        }
        set_scan_state(state.trim());

        if (button) {
            button.hidden = !status.can_scan;
            button.disabled =
                !status.can_scan ||
                running ||
                queued ||
                cooldown > 0 ||
                scan_request_pending;
        }
    }

    function schedule_status_poll(delay) {
        clearTimeout(status_timeout);
        const status = dashboard_status;
        const running =
            status &&
            (status.scan_in_progress ||
                status.latest_request?.status === 'pending' ||
                status.latest_request?.status === 'running');
        status_timeout = setTimeout(load_status, delay ?? (running ? 5000 : 30000));
    }

    async function load_status() {
        try {
            const response = await fetch('/api/dashboard/status', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });

            if (response.status === 401) {
                show_login_prompt();
                return;
            }
            if (!response.ok) throw new Error(`status request failed (${response.status})`);

            dashboard_status = await response.json();
            status_updated_at = Date.now();
            scan_request_pending = false;
            update_status_display();
            schedule_status_poll();
        } catch (error) {
            console.error('Dashboard status error:', error);
            schedule_status_poll(30000);
        }
    }

    function build_scan_report(status) {
        const last_scan = status?.last_scan || null;
        const errors = Array.isArray(last_scan?.errors) ? last_scan.errors : [];
        const latest = status?.latest_request || null;
        const lines = [
            'Free Game Deals — Last scan report',
            `Generated: ${new Date().toISOString()}`,
            `Last scan: ${
                status?.last_scan_at
                    ? new Date(status.last_scan_at).toISOString()
                    : 'never'
            }`,
            `Duration: ${
                last_scan && Number.isFinite(last_scan.duration_ms)
                    ? format_duration(last_scan.duration_ms)
                    : 'n/a'
            }`,
            `New deals: ${last_scan?.new_deals ?? 0}`,
            `Messages sent: ${last_scan?.messages_sent ?? 0}`,
            `Active games: ${status?.active_games ?? 0}`,
            `Errors: ${errors.length}`,
            '',
            'Latest scan request:',
        ];

        if (latest) {
            lines.push(
                `- status: ${latest.status || 'unknown'}`,
                `- requested by: ${latest.requested_by_tag || latest.requested_by || 'unknown'}`,
                `- server: ${latest.guild_name || 'unknown'}`,
                `- created at: ${latest.created_at || 'unknown'}`,
                `- finished at: ${latest.finished_at || 'not finished'}`,
                `- reason: ${latest.reason || 'none'}`
            );
        } else {
            lines.push('- none');
        }

        lines.push('', 'Errors:');
        if (errors.length > 0) {
            errors.forEach((error, index) => {
                lines.push(`${index + 1}. ${error}`);
            });
        } else {
            lines.push('No errors recorded.');
        }

        return `${lines.join('\n')}\n`;
    }

    function download_errors() {
        const report = build_scan_report(dashboard_status);
        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.href = url;
        link.download = `fgd-scan-errors-${stamp}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async function trigger_scan() {
        if (!dashboard_status?.can_scan) return;

        const button = document.getElementById('dashboard-scan-button');
        if (button) button.disabled = true;
        scan_request_pending = true;
        set_scan_message('', false);

        try {
            const response = await fetch('/api/dashboard/scan', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf_token || '',
                },
                body: JSON.stringify({
                    guild_id: selected_guild ? selected_guild.id : null,
                }),
            });

            let data = null;
            try {
                data = await response.json();
            } catch (_) {
                data = null;
            }

            if (response.status === 202) {
                set_scan_message(
                    tr('dashboardScanStarted', 'Scan requested. It will start shortly.'),
                    false
                );
                schedule_status_poll(2000);
                return;
            }

            if (response.status === 409) {
                scan_request_pending = false;
                const in_progress = data && data.error === 'scan_in_progress';
                set_scan_message(
                    in_progress
                        ? tr('dashboardScanInProgress', 'A scan is already in progress.')
                        : tr('dashboardScanQueued', 'A scan is already queued.'),
                    true
                );
                schedule_status_poll(5000);
                return;
            }

            if (response.status === 429 && data && data.retry_after_ms) {
                scan_request_pending = false;
                if (dashboard_status) {
                    dashboard_status.cooldown_remaining_ms = data.retry_after_ms;
                    status_updated_at = Date.now();
                }
                set_scan_message(
                    tr('dashboardScanCooldown', 'Next scan available in {time}.').replace(
                        '{time}',
                        format_duration(data.retry_after_ms)
                    ),
                    true
                );
                update_status_display();
                return;
            }

            if (response.status === 403) {
                scan_request_pending = false;
                set_scan_message(
                    tr('dashboardScanOwnerOnly', 'Only the bot owner can start a scan.'),
                    true
                );
                return;
            }

            throw new Error((data && data.error) || 'scan failed');
        } catch (error) {
            console.error('Dashboard scan error:', error);
            scan_request_pending = false;
            set_scan_message(tr('dashboardScanError', 'Could not start the scan.'), true);
            schedule_status_poll(10000);
        } finally {
            update_status_display();
        }
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
            show_login_prompt(
                tr(
                    'dashboardReauth',
                    'Your Discord permissions are outdated. Please log in again.'
                )
            );
            return;
        }

        if (!response.ok || !data) {
            show_login_prompt(
                tr('dashboardUnavailable', 'The dashboard is temporarily unavailable.')
            );
            return;
        }

        csrf_token = data.csrf_token;
        guilds = Array.isArray(data.guilds) ? data.guilds : [];

        show_content();
        render_guild_list();

        if (guilds.length > 0) {
            select_guild(guilds[0]);
        }
    }

    async function save_settings(event) {
        event.preventDefault();
        if (!selected_guild || saving) return;

        const language = document.getElementById('dashboard-language');
        const ping_role = document.getElementById('dashboard-ping-role');
        const channel = document.getElementById('dashboard-channel');
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
                        channel_id: channel ? channel.value || null : undefined,
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
        const scan_button = document.getElementById('dashboard-scan-button');
        const download_button = document.getElementById('dashboard-download-errors');
        const login = document.getElementById('dashboard-login');
        if (form) form.addEventListener('submit', save_settings);
        if (scan_button) scan_button.addEventListener('click', trigger_scan);
        if (download_button) download_button.addEventListener('click', download_errors);

        try {
            const response = await fetch('/api/user', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (!response.ok) throw new Error('auth check failed');
            const data = await response.json();
            if (!data.loggedIn || !data.user) {
                if (login) login.hidden = false;
                show_login_prompt();
                return;
            }
            build_nav(data.user);
        } catch (error) {
            console.error('Dashboard auth error:', error);
            if (login) login.hidden = false;
            show_login_prompt();
            return;
        }

        try {
            await Promise.all([load_dashboard(), load_status()]);
        } catch (error) {
            console.error('Dashboard load error:', error);
            show_login_prompt(
                tr('dashboardUnavailable', 'The dashboard is temporarily unavailable.')
            );
        }

        setInterval(update_status_display, 1000);
    }

    window.addEventListener('fgd:language', () => {
        update_status_display();
        if (selected_guild) {
            const status = document.getElementById('dashboard-status');
            if (status) status.textContent = '';
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();
