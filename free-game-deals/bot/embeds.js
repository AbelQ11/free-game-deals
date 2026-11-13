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
const { EmbedBuilder } = require('discord.js');

const lang_data = require('../lib/lang');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
    infer_store,
    store_color,
} = require('../lib/sanitize');
const { client } = require('./context');

const ACTIVE_DEALS_SQL =
    `SELECT * FROM sent_deals
     WHERE end_date IS NULL
        OR end_date = ''
        OR end_date = 'null'
        OR CAST(end_date AS INTEGER) > ?
     ORDER BY date DESC
     LIMIT 5`;

function t(key, locale) {
    const primary_lang = locale ? locale.split('-')[0] : 'en';
    const translation_set = lang_data[primary_lang] || lang_data['en'];
    return translation_set?.[key] ?? lang_data['en']?.[key] ?? key;
}

function truncate(value, max_length) {
    const text = String(value || '');
    return text.length > max_length ? `${text.slice(0, max_length - 1)}…` : text;
}

function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function build_embed(game, locale) {
    const title = truncate(clean_text(game.title, 250) || 'Unknown game', 250);
    let description = t('newGameDesc', locale).replace('{store}', game.store);

    const summary = clean_description(game.description, 900);
    if (summary) description += `\n\n${summary}`;

    const end_date = Number(game.end_date);
    if (game.end_date && game.end_date !== 'null' && Number.isFinite(end_date)) {
        description += `\n\n${t('endDateMsg', locale)} <t:${Math.floor(end_date)}:F>`;
    }

    const embed = new EmbedBuilder()
        .setTitle(truncate(`${t('newGameTitle', locale)} : ${title}`, 256))
        .setColor(store_color(game.store))
        .setDescription(truncate(description, 4000))
        .setFooter({
            text: `Deal ID: ${game.id} | Free Game Deals`,
            iconURL: client.user.displayAvatarURL(),
        })
        .setTimestamp();

    const link = safe_link(game.link);
    if (link) embed.setURL(link);

    const image = safe_image(game.thumb);
    if (image) embed.setImage(image);

    return embed;
}

function generate_embeds(rows, locale) {
    return rows.map((row) =>
        build_embed(
            {
                id: row.id,
                title: row.title,
                link: row.link,
                thumb: row.thumb,
                description: row.description,
                store: row.store || infer_store(row.link),
                end_date: row.end_date,
            },
            locale
        )
    );
}

module.exports = {
    ACTIVE_DEALS_SQL,
    t,
    truncate,
    chunk,
    build_embed,
    generate_embeds,
};
