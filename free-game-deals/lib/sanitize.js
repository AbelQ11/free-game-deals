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

const LINK_HOSTS = ['steampowered.com', 'epicgames.com', 'gog.com'];
const IMAGE_HOSTS = [
    'steamstatic.com',
    'epicgames.com',
    'unrealengine.com',
    'gog-statics.com',
    'discordapp.com',
    'discord.com',
];

function clean_description(value, max_length = 1200) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max_length);
}

function clean_text(value, max_length = 300) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max_length);
}

function host_is_allowed(hostname, allowed_hosts) {
    const host = String(hostname || '').toLowerCase();
    return allowed_hosts.some((allowed) => {
        const candidate = allowed.toLowerCase();
        return host === candidate || host.endsWith(`.${candidate}`);
    });
}

function safe_url(value, allowed_hosts) {
    if (typeof value !== 'string') return null;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:') return null;
        if (allowed_hosts && !host_is_allowed(parsed.hostname, allowed_hosts)) return null;
        return parsed.href;
    } catch (_) {
        return null;
    }
}

function safe_link(value) {
    return safe_url(value, LINK_HOSTS);
}

function safe_image(value) {
    return safe_url(value, IMAGE_HOSTS);
}

function infer_store(link) {
    try {
        const host = new URL(link).hostname.toLowerCase();
        if (host === 'epicgames.com' || host.endsWith('.epicgames.com')) return 'Epic Games';
        if (host === 'gog.com' || host.endsWith('.gog.com')) return 'GOG';
    } catch (_) {
        // Ignore invalid URLs and use the default store.
    }
    return 'Steam';
}

function store_color(store) {
    if (store === 'Epic Games') return '#ffffff';
    if (store === 'GOG') return '#c1318f';
    return '#66c0f4';
}

module.exports = {
    LINK_HOSTS,
    IMAGE_HOSTS,
    clean_text,
    clean_description,
    safe_url,
    safe_link,
    safe_image,
    infer_store,
    store_color,
};
