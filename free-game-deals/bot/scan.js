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
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
} = require('discord.js');

const { client, db, BASE_URL, MAX_EMBEDS_PER_MESSAGE } = require('./context');
const { run_query, run_exec } = require('../lib/db');
const { clean_description } = require('../lib/sanitize');
const { t, chunk, build_embed } = require('./embeds');
const { set_last_scan_time, update_guild_count } = require('./settings');
const scrape_steam = require('../scrapers/steam.js');
const scrape_epic = require('../scrapers/epic_games.js');
const scrape_gog = require('../scrapers/gog.js');

async function get_free_games() {
    const scan_results = await Promise.allSettled([
        scrape_steam(),
        scrape_epic(),
        scrape_gog(),
    ]);

    const results = scan_results.map((result) => {
        if (result.status === 'fulfilled' && result.value) return result.value;
        if (result.status === 'rejected') console.error('Scraper rejected:', result.reason);
        return { store: null, ok: false, found_ids: [], new_deals: [] };
    });

    // Deduplicate candidates across stores.
    const candidates = new Map();
    for (const result of results) {
        for (const deal of result.new_deals || []) {
            if (deal && deal.id && !candidates.has(deal.id)) candidates.set(deal.id, deal);
        }
    }

    // A deal is "already announced" only while it is active. Deals whose
    // end_date is in the past may be announced again if they return.
    const candidate_ids = [...candidates.keys()];
    const active_ids = new Set();

    if (candidate_ids.length > 0) {
        const placeholders = candidate_ids.map(() => '?').join(',');
        const now = Math.floor(Date.now() / 1000);
        const rows = await run_query(
            db,
            `SELECT id FROM sent_deals
             WHERE notified = 1
               AND id IN (${placeholders})
               AND (end_date IS NULL OR CAST(end_date AS INTEGER) > ?)`,
            [...candidate_ids, now]
        );
        for (const row of rows) active_ids.add(row.id);
    }

    const new_deals = [...candidates.values()].filter((deal) => !active_ids.has(deal.id));

    // Only mark deals as ended when that store's scan actually succeeded.
    // Otherwise a temporary network failure would end every deal.
    await mark_ended_deals(results);

    const failed_stores = results
        .filter((result) => result.ok === false && result.store)
        .map((result) => result.store);

    return { new_deals, failed_stores };
}

async function mark_ended_deals(results) {
    const now = Math.floor(Date.now() / 1000);

    for (const result of results) {
        if (!result.ok || !result.store) continue;

        const found_ids = Array.isArray(result.found_ids) ? result.found_ids : [];

        if (found_ids.length === 0) {
            await run_exec(
                db,
                `UPDATE sent_deals
                 SET end_date = ?
                 WHERE store = ?
                   AND notified = 1
                   AND (end_date IS NULL OR CAST(end_date AS INTEGER) > ?)`,
                [now, result.store, now]
            );
            continue;
        }

        const placeholders = found_ids.map(() => '?').join(',');
        await run_exec(
            db,
            `UPDATE sent_deals
             SET end_date = ?
             WHERE store = ?
               AND notified = 1
               AND id NOT IN (${placeholders})
               AND (end_date IS NULL OR CAST(end_date AS INTEGER) > ?)`,
            [now, result.store, ...found_ids, now]
        );
    }
}

async function save_sent_deals(games) {
    for (const game of games) {
        const date_now = new Date().toISOString().replace('T', ' ').substring(0, 16);
        await run_exec(
            db,
            `INSERT INTO sent_deals (id, title, thumb, link, description, date, end_date, store, notified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET
                 title = excluded.title,
                 thumb = excluded.thumb,
                 link = excluded.link,
                 description = excluded.description,
                 date = excluded.date,
                 end_date = excluded.end_date,
                 store = excluded.store,
                 notified = 1`,
            [
                game.id,
                game.title,
                game.thumb || null,
                game.link,
                clean_description(game.description) || null,
                date_now,
                game.end_date == null ? null : String(game.end_date),
                game.store,
            ]
        );
    }
}

let scan_promise = null;

function scan_loop() {
    if (scan_promise) return scan_promise;
    scan_promise = (async () => {
        const started_at = Date.now();
        const errors = [];
        let new_deals = 0;
        let messages_sent = 0;

        try {
            await set_last_scan_time(Date.now());
            await update_guild_count();

            const scan_result = await get_free_games();
            const new_games = scan_result.new_deals;
            new_deals = new_games.length;
            errors.push(
                ...scan_result.failed_stores.map((store) => `${store} scan failed`)
            );

            if (new_games.length > 0) {
                const guild_settings = await run_query(db, 'SELECT * FROM guild_settings');
                const conf_map = new Map(
                    guild_settings.map((row) => [String(row.guild_id), row])
                );
                const sent_ids = new Set();

                for (const guild of client.guilds.cache.values()) {
                    try {
                        const conf = conf_map.get(guild.id) || {
                            language: 'en',
                            ping_role: 'everyone',
                            steam_on: 1,
                            epic_on: 1,
                            gog_on: 1,
                        };

                        const valid_games = new_games.filter((game) => {
                            if (game.store === 'Steam' && conf.steam_on === 0) return false;
                            if (game.store === 'Epic Games' && conf.epic_on === 0) return false;
                            if (game.store === 'GOG' && conf.gog_on === 0) return false;
                            return true;
                        });

                        if (valid_games.length === 0) continue;

                        const channel = guild.channels.cache.find(
                            (item) => item.name === 'free-games'
                        );
                        if (!channel || !channel.isTextBased() || !channel.isSendable()) continue;

                        const me = guild.members.me;
                        if (!me) continue;

                        const permissions = channel.permissionsFor(me);
                        const required = [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.EmbedLinks,
                        ];
                        if (!permissions?.has(required)) {
                            console.warn(
                                `Missing channel permissions in guild ${guild.id}`
                            );
                            continue;
                        }

                        const server_lang = conf.language || guild.preferredLocale || 'en';
                        const ping_role = conf.ping_role || 'everyone';
                        // Discord has a single MentionEveryone permission that
                        // covers @everyone, @here and role mentions.
                        const can_ping = permissions.has(
                            PermissionsBitField.Flags.MentionEveryone
                        );

                        const ping_text = can_ping
                            ? ping_role === 'everyone'
                                ? '@everyone'
                                : `<@&${ping_role}>`
                            : '';
                        const allowed_mentions = can_ping
                            ? ping_role === 'everyone'
                                ? { parse: ['everyone'] }
                                : { parse: [], roles: [ping_role] }
                            : { parse: [] };

                        if (!can_ping) {
                            console.warn(
                                `Missing mention permission for role "${ping_role}" in guild ${guild.id}`
                            );
                        }

                        const history_btn = new ButtonBuilder()
                            .setLabel(t('historyBtn', server_lang))
                            .setURL(BASE_URL)
                            .setStyle(ButtonStyle.Link);
                        const action_row = new ActionRowBuilder().addComponents(history_btn);
                        let is_first_chunk = true;

                        for (const group of chunk(valid_games, MAX_EMBEDS_PER_MESSAGE)) {
                            try {
                                const embeds = group.map((game) =>
                                    build_embed(game, server_lang)
                                );
                                const sent_msg = await channel.send({
                                    content:
                                        is_first_chunk && ping_text ? ping_text : undefined,
                                    embeds,
                                    components: [action_row],
                                    allowedMentions: is_first_chunk
                                        ? allowed_mentions
                                        : { parse: [] },
                                });
                                is_first_chunk = false;
                                messages_sent += 1;

                                for (const game of group) {
                                    await run_exec(
                                        db,
                                        `INSERT OR IGNORE INTO deal_messages (deal_id, channel_id, message_id)
                                         VALUES (?, ?, ?)`,
                                        [game.id, channel.id, sent_msg.id]
                                    );
                                    sent_ids.add(game.id);
                                }
                            } catch (error) {
                                console.error(`Send Alert Error (Guild: ${guild.id})`, error);
                                errors.push(error.message);
                            }
                        }
                    } catch (error) {
                        console.error(`Send Alert Error (Guild: ${guild.id})`, error);
                        errors.push(error.message);
                    }
                }

                const sent_games = new_games.filter((game) => sent_ids.has(game.id));
                if (sent_games.length > 0) await save_sent_deals(sent_games);
            }
        } catch (error) {
            console.error('Scan error:', error);
            errors.push(error.message);
        }

        return {
            duration_ms: Date.now() - started_at,
            new_deals,
            messages_sent,
            errors,
        };
    })().finally(() => {
        scan_promise = null;
    });

    return scan_promise;
}

function is_scan_running() {
    return scan_promise !== null;
}

module.exports = {
    get_free_games,
    mark_ended_deals,
    save_sent_deals,
    scan_loop,
    is_scan_running,
};
