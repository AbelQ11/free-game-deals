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
const fs = require('fs');
const path = require('path');

const lang_data = require('./lang');
const { BASE_URL, ROOT_DIR } = require('./config');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
    infer_store,
} = require('./sanitize');

const STATIC_DIR = path.join(ROOT_DIR, 'static');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');
const INDEX_HTML_PATH = path.join(STATIC_DIR, 'index.html');
const STATS_HTML_PATH = path.join(STATIC_DIR, 'stats.html');
const DASHBOARD_HTML_PATH = path.join(STATIC_DIR, 'dashboard.html');
const DEAL_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'deal.html');

function escape_xml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function escape_html(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function store_badge_html(host) {
    if (host === 'steampowered.com' || host.endsWith('.steampowered.com')) {
        return '<span class="badge badge-steam">Steam</span>';
    }
    if (host === 'epicgames.com' || host.endsWith('.epicgames.com')) {
        return '<span class="badge badge-epic">Epic Games</span>';
    }
    if (host === 'gog.com' || host.endsWith('.gog.com')) {
        return '<span class="badge badge-gog">GOG.com</span>';
    }
    return '';
}

function parse_deal_date(value) {
    const text = clean_text(value, 32);
    if (!text) return null;
    const parsed = new Date(`${text.replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const LOCALE_MAP = {
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    pt: 'pt-PT',
    de: 'de-DE',
    it: 'it-IT',
    ru: 'ru-RU',
};

function locale_for(lang) {
    return LOCALE_MAP[lang] || LOCALE_MAP.en;
}

function format_date_text(value, lang = 'en') {
    const parsed = value instanceof Date ? value : parse_deal_date(value);
    if (!parsed) return '';
    return parsed.toLocaleDateString(locale_for(lang), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function format_unix_text(value, lang = 'en') {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return '';
    return new Date(timestamp * 1000).toLocaleDateString(locale_for(lang), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function clamp_text(value, max_length) {
    const text = String(value || '');
    return text.length > max_length ? `${text.slice(0, max_length - 1)}…` : text;
}

function translate(key, lang) {
    const translations = lang_data[lang] || lang_data.en || {};
    return translations[key] ?? lang_data.en?.[key] ?? key;
}

function deal_is_active(row) {
    if (!row || !row.end_date || row.end_date === 'null') return true;
    const end = Number(row.end_date);
    return Number.isFinite(end) ? end > Date.now() / 1000 : true;
}

function render_related_cards(rows, current_id, lang = 'en') {
    return (rows || [])
        .filter((row) => row.id !== current_id)
        .map((row) => {
            const id = clean_text(row.id, 120);
            if (!id) return '';
            const title = clean_text(row.title, 300) || 'Free game';
            const store = clean_text(row.store, 32) || 'Store';
            const date = format_date_text(row.date, lang) || clean_text(row.date, 32);
            return (
                '<li>' +
                `<a href="/deal/${encodeURIComponent(id)}">${escape_html(title)}</a>` +
                `<span>${escape_html(store)}${date ? ` · ${escape_html(date)}` : ''}</span>` +
                '</li>'
            );
        })
        .join('');
}

function render_deal_page(row, related_rows, lang = 'en') {
    const link = safe_link(row.link);
    const thumb = safe_image(row.thumb);
    const title = clean_text(row.title, 200) || 'Free game';
    const store = clean_text(row.store, 32) || infer_store(link);
    const id = clean_text(row.id, 120);
    const canonical = `${BASE_URL}/deal/${encodeURIComponent(id)}`;
    const date_obj = parse_deal_date(row.date);
    const date_text = date_obj
        ? format_date_text(date_obj, lang)
        : clean_text(row.date, 32) || 'a recent day';
    const active = deal_is_active(row);
    const has_end_date =
        row.end_date != null &&
        row.end_date !== '' &&
        row.end_date !== 'null' &&
        Number.isFinite(Number(row.end_date));
    const end_date_text = has_end_date ? format_unix_text(row.end_date, lang) : '';
    const end_text = active
        ? has_end_date
            ? ` The offer ends on ${end_date_text}.`
            : ' This offer is currently active.'
        : ' This offer has ended and is kept as part of the deal history.';

    const headline = translate(active ? 'dealHeadlineActive' : 'dealHeadlineEnded', lang)
        .replace('{title}', title)
        .replace('{store}', store);
    const subtitle_key = active
        ? has_end_date
            ? 'dealTrackedEnds'
            : 'dealTrackedActive'
        : 'dealTrackedEnded';
    const subtitle = translate(subtitle_key, lang)
        .replace('{date}', date_text)
        .replace('{end}', end_date_text);
    const game_description = clean_description(row.description, 1200);
    const description =
        game_description ||
        translate(active ? 'dealDescActive' : 'dealDescEnded', lang)
            .replace('{title}', title)
            .replace('{store}', store)
            .replace('{date}', date_text);
    const meta_description = clamp_text(description, 160);
    const page_title = clamp_text(
        `${title} — ${active ? 'Free' : 'Was Free'} on ${store} | Free Game Deals`,
        90
    );
    const og_image = thumb || `${BASE_URL}/og-image.jpg`;
    const published_time = date_obj ? date_obj.toISOString() : new Date().toISOString();
    const offer_label = link
        ? translate('offerOnStore', lang).replace('{store}', store)
        : 'Offer link unavailable';
    const link_attrs = link ? ' target="_blank" rel="noopener noreferrer"' : '';

    const offer = {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: active ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    };
    if (link) offer.url = link;
    if (date_obj) offer.validFrom = date_obj.toISOString();
    if (has_end_date) {
        offer.validThrough = new Date(Number(row.end_date) * 1000).toISOString();
    }
    offer.seller = { '@type': 'Organization', name: store };

    const json_ld = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': `${BASE_URL}/#organization`,
                name: 'Free Game Deals',
                url: `${BASE_URL}/`,
                logo: {
                    '@type': 'ImageObject',
                    url: `${BASE_URL}/favicon.jpg`,
                    width: 256,
                    height: 256,
                },
            },
            {
                '@type': 'ItemPage',
                '@id': `${canonical}#webpage`,
                url: canonical,
                name: page_title,
                description: meta_description,
                inLanguage: 'en',
                isPartOf: { '@id': `${BASE_URL}/#website` },
                primaryImageOfPage: { '@type': 'ImageObject', url: og_image },
                datePublished: published_time,
                dateModified: published_time,
            },
            {
                '@type': 'Product',
                '@id': `${canonical}#product`,
                name: title,
                url: canonical,
                image: [og_image],
                description: meta_description,
                category: 'VideoGame',
                sku: id,
                brand: { '@type': 'Brand', name: store },
                offers: offer,
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'Home',
                        item: `${BASE_URL}/`,
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: title,
                        item: canonical,
                    },
                ],
            },
        ],
    }).replace(/</g, '\\u003c');

    const replacements = {
        __PAGE_TITLE__: escape_html(page_title),
        __META_DESCRIPTION__: escape_html(meta_description),
        __CANONICAL__: escape_html(canonical),
        __OG_IMAGE__: escape_html(og_image),
        __PUBLISHED_TIME__: escape_html(published_time),
        __GAME_TITLE__: escape_html(title),
        __GAME_TITLE_TEXT__: escape_html(title),
        __STORE__: escape_html(store),
        __STORE_TEXT__: escape_html(store),
        __HEADLINE__: escape_html(headline),
        __SUBTITLE__: escape_html(subtitle),
        __DATE_TEXT__: escape_html(date_text),
        __DATE_ISO__: escape_html(date_obj ? date_obj.toISOString() : ''),
        __ACTIVE__: active ? 'true' : 'false',
        __END_DATE_TEXT__: escape_html(end_date_text),
        __END_TS__: has_end_date ? String(row.end_date) : '',
        __END_TEXT__: escape_html(end_text),
        __DESCRIPTION__: escape_html(description),
        __DESCRIPTION_ATTR__: game_description ? 'data-game-description="true"' : '',
        __GAME_IMAGE__: escape_html(thumb || `${BASE_URL}/placeholder-game.jpg`),
        __GAME_URL__: escape_html(link || '#'),
        __GAME_LINK_ATTRS__: link_attrs,
        __OFFER_LABEL__: escape_html(offer_label),
        __RELATED_HTML__: render_related_cards(related_rows, id, lang),
        __JSON_LD__: json_ld,
    };

    let html = get_deal_template(lang);
    for (const [key, value] of Object.entries(replacements)) {
        html = html.split(key).join(value);
    }
    return html;
}

function render_game_cards(rows, lang = 'en') {
    if (!rows || rows.length === 0) {
        return `<p id="loading-text" data-i18n="scanning">${escape_html(
            translate('scanning', lang)
        )}</p>`;
    }

    return rows
        .map((row) => {
            const link = safe_link(row.link);
            const thumb = safe_image(row.thumb) || '/placeholder-game.jpg';
            const title = clean_text(row.title, 300) || 'Free game';
            const date = clean_text(row.date, 32);
            const store = clean_text(row.store, 32) || infer_store(link);
            const description = clean_description(row.description, 180);

            let host = '';
            try {
                host = link ? new URL(link).hostname.toLowerCase() : '';
            } catch (_) {
                host = '';
            }

            const badge = store_badge_html(host);
            const end_timestamp = Number(row.end_date);
            const has_end_date =
                row.end_date != null &&
                row.end_date !== '' &&
                row.end_date !== 'null' &&
                Number.isFinite(end_timestamp);
            const end_label_key =
                end_timestamp <= Date.now() / 1000 ? 'endedLabel' : 'endsLabel';
            const end_date = has_end_date
                ? `<span class="end-date"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span data-timestamp="${escape_html(
                      row.end_date
                  )}">${escape_html(translate(end_label_key, lang))}: ${escape_html(
                      format_unix_text(row.end_date, lang)
                  )}</span></span>`
                : '';
            const target = link ? ' target="_blank" rel="noopener noreferrer"' : '';
            const deal_id = clean_text(row.id, 120);
            const deal_path = deal_id ? `/deal/${encodeURIComponent(deal_id)}` : '#';
            const button_key =
                store === 'Epic Games'
                    ? 'viewEpic'
                    : store === 'GOG'
                      ? 'viewGog'
                      : store === 'Steam'
                        ? 'viewSteam'
                        : 'viewOffer';
            const button_label = translate(button_key, lang);

            const overlay = deal_id
                ? `<a class="card-link-overlay" href="${escape_html(
                      deal_path
                  )}" aria-label="${escape_html(
                      translate('viewDetailsFor', lang).replace('{title}', title)
                  )}"></a>`
                : '';

            return (
                '<article class="card">' +
                overlay +
                '<div class="img-wrapper">' +
                `<img src="${escape_html(thumb)}" alt="${escape_html(
                    `${title} — free game cover`
                )}" loading="lazy" decoding="async" width="480" height="160" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/placeholder-game.jpg'">` +
                badge +
                '</div>' +
                '<div class="info">' +
                `<h3>${escape_html(title)}</h3>` +
                (description
                    ? `<p class="card-description">${escape_html(description)}</p>`
                    : '') +
                `<span class="date">${escape_html(date)}</span>` +
                end_date +
                `<a href="${escape_html(link || '#')}"${target} class="btn-card" data-i18n="${button_key}">${escape_html(
                    button_label
                )}</a>` +
                '</div>' +
                '</article>'
            );
        })
        .join('');
}

// The public base URL is configurable through BASE_URL, so inject it into the
// static HTML instead of hardcoding a domain in the page. The language is
// stored in a cookie so the server can render the first paint in the right
// language instead of flashing English before page-i18n runs.
function fill_i18n(html, lang = 'en') {
    const translations = lang_data[lang] || lang_data.en || {};
    return html.replace(
        /<([a-zA-Z0-9]+)([^>]*\bdata-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/g,
        (match, tag, attrs, key) => {
            let value = translations[key];
            if (!value) return match;

            const store_match = attrs.match(/\bdata-i18n-store="([^"]*)"/);
            if (store_match) value = value.replace(/{store}/g, store_match[1]);

            return `<${tag}${attrs}>${value}</${tag}>`;
        }
    );
}

function get_request_lang(req) {
    const cookies = String(req?.headers?.cookie || '');
    const match = cookies.match(/(?:^|;\s*)fgd_lang=([a-z]{2})(?:;|$)/);
    const cookie_lang = match && match[1];
    if (cookie_lang && lang_data[cookie_lang]) return cookie_lang;

    const accept_language = String(req?.headers?.['accept-language'] || '');
    for (const part of accept_language.split(',')) {
        const code = part.trim().slice(0, 2).toLowerCase();
        if (lang_data[code]) return code;
    }

    return 'en';
}

const template_cache = new Map();

function load_template(file_path, lang = 'en') {
    const key = `${file_path}:${lang}`;
    if (!template_cache.has(key)) {
        template_cache.set(
            key,
            fill_i18n(
                fs.readFileSync(file_path, 'utf8').replace(/__BASE_URL__/g, BASE_URL),
                lang
            )
        );
    }
    return template_cache.get(key);
}

function get_index_template(lang = 'en') {
    return load_template(INDEX_HTML_PATH, lang);
}

function get_index_html(games_html, lang = 'en') {
    return get_index_template(lang).replace('__GAMES_HTML__', games_html);
}

function get_stats_html(lang = 'en') {
    return load_template(STATS_HTML_PATH, lang);
}

function get_dashboard_html(lang = 'en') {
    return load_template(DASHBOARD_HTML_PATH, lang);
}

function get_deal_template(lang = 'en') {
    return load_template(DEAL_TEMPLATE_PATH, lang);
}

module.exports = {
    escape_xml,
    escape_html,
    store_badge_html,
    parse_deal_date,
    format_date_text,
    format_unix_text,
    clamp_text,
    deal_is_active,
    render_related_cards,
    render_deal_page,
    render_game_cards,
    fill_i18n,
    get_request_lang,
    get_index_html,
    get_stats_html,
    get_dashboard_html,
    get_deal_template,
};
