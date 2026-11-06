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
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ActivityType,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
require('dotenv').config();
const path = require('path');

const lang_data = require('./lib/lang');
const { open_database, ensure_schema, run_query, run_exec } = require('./lib/db');
const {
    clean_text,
    clean_description,
    safe_link,
    safe_image,
    infer_store,
    store_color,
} = require('./lib/sanitize');

const scrape_steam = require('./scrapers/steam.js');
const scrape_epic = require('./scrapers/epic_games.js');
const scrape_gog = require('./scrapers/gog.js');

const SCAN_COOLDOWN = 15 * 60 * 1000;
const SCAN_INTERVAL = 30 * 60 * 1000;
const MAX_EMBEDS_PER_MESSAGE = 10;
const CLIENT_ID = process.env.CLIENT_ID;
const BASE_URL = (process.env.BASE_URL || 'https://free-game-deals.kiliotsu.eu').replace(/\/+$/, '');
const DB_NAME = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, 'deals_memory.db');

if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN is not set. Check your .env file.');
    process.exit(1);
}

const client = new Client({
    // Slash commands do not need the privileged MessageContent intent.
    intents: [GatewayIntentBits.Guilds],
});

const db = open_database(DB_NAME);

let owner_id = /^\d+$/.test(process.env.OWNER_ID || '') ? process.env.OWNER_ID : null;

async function resolve_owner_id() {
    if (owner_id) return owner_id;

    try {
        const application = await client.application.fetch();
        const owner = application.owner;
        const resolved = owner && (owner.ownerId || owner.id);
        if (resolved) owner_id = String(resolved);
    } catch (error) {
        console.warn('Could not resolve the Discord application owner:', error.message);
    }

    if (!owner_id) {
        console.warn(
            'Owner scan notifications are disabled: set OWNER_ID in .env to enable them.'
        );
    } else {
        console.log('Owner scan notifications enabled.');
    }

    return owner_id;
}

async function notify_owner(embed) {
    if (!owner_id) return;

    try {
        const user = await client.users.fetch(owner_id);
        await user.send({ embeds: [embed] });
    } catch (error) {
        // Closed DMs must never break a scan.
        console.warn('Owner scan notification failed:', error.message);
    }
}

function get_scan_context(interaction) {
    return {
        user_tag: interaction.user.tag || interaction.user.username || 'unknown',
        user_id: interaction.user.id,
        guild_name: interaction.guild?.name || 'unknown',
        guild_id: interaction.guild?.id || 'unknown',
        channel_name: interaction.channel?.name || 'unknown',
        channel_id: interaction.channel?.id || 'unknown',
    };
}

function build_owner_scan_embed(
    kind,
    lang,
    summary = null,
    context = null,
    reason_key = null
) {
    const embed = new EmbedBuilder().setColor('#8b5cf6').setTimestamp();

    const context_fields = context
        ? [
              {
                  name: t('ownerScanUser', lang),
                  value: `${context.user_tag} (${context.user_id})`,
                  inline: true,
              },
              {
                  name: t('ownerScanGuild', lang),
                  value: `${context.guild_name} (${context.guild_id})`,
                  inline: true,
              },
              {
                  name: t('ownerScanChannel', lang),
                  value: `${context.channel_name} (${context.channel_id})`,
                  inline: true,
              },
          ]
        : [];

    if (kind === 'blocked') {
        return embed
            .setColor('#ef4444')
            .setTitle(t('ownerScanBlockedTitle', lang))
            .setDescription(t('ownerScanBlockedDesc', lang))
            .addFields(
                ...context_fields,
                {
                    name: t('ownerScanReason', lang),
                    value: t(reason_key || 'scanInProgress', lang),
                    inline: false,
                }
            );
    }

    if (kind === 'started') {
        return embed
            .setTitle(t('ownerScanStartedTitle', lang))
            .setDescription(t('ownerScanStartedDesc', lang))
            .addFields(...context_fields);
    }

    const errors = summary && Array.isArray(summary.errors) ? summary.errors.length : 0;
    const duration_seconds =
        summary && Number.isFinite(summary.duration_ms)
            ? Math.max(1, Math.round(summary.duration_ms / 1000))
            : 0;

    return embed
        .setTitle(t('ownerScanFinishedTitle', lang))
        .setDescription(t('ownerScanFinishedDesc', lang))
        .addFields(
            ...context_fields,
            {
                name: t('ownerScanDuration', lang),
                value: `${duration_seconds}s`,
                inline: true,
            },
            {
                name: t('ownerScanNewDeals', lang),
                value: String(summary ? summary.new_deals : 0),
                inline: true,
            },
            {
                name: t('ownerScanSent', lang),
                value: String(summary ? summary.messages_sent : 0),
                inline: true,
            },
            {
                name: t('ownerScanErrors', lang),
                value: String(errors),
                inline: true,
            }
        );
}

function t(key, locale) {
    const primary_lang = locale ? locale.split('-')[0] : 'en';
    const translation_set = lang_data[primary_lang] || lang_data['en'];
    return translation_set?.[key] ?? lang_data['en']?.[key] ?? key;
}

function truncate(value, max_length) {
    const text = String(value || '');
    return text.length > max_length ? `${text.slice(0, max_length - 1)}…` : text;
}

const ACTIVE_DEALS_SQL =
    `SELECT * FROM sent_deals
     WHERE end_date IS NULL
        OR end_date = ''
        OR end_date = 'null'
        OR CAST(end_date AS INTEGER) > ?
     ORDER BY date DESC
     LIMIT 5`;

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

async function get_last_scan_time() {
    const rows = await run_query(db, "SELECT value FROM bot_meta WHERE key = 'last_scan_time'");
    return rows.length > 0 ? Number.parseInt(rows[0].value, 10) || 0 : 0;
}

async function set_last_scan_time(timestamp) {
    await run_exec(
        db,
        "INSERT OR REPLACE INTO bot_meta (key, value) VALUES ('last_scan_time', ?)",
        [String(timestamp)]
    );
}

async function update_guild_count() {
    await run_exec(
        db,
        "INSERT OR REPLACE INTO bot_meta (key, value) VALUES ('guild_count', ?)",
        [String(client.guilds.cache.size)]
    );
}

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

async function register_commands() {
    if (!CLIENT_ID) {
        console.warn('CLIENT_ID is not set; skipping slash command registration.');
        return;
    }

    const commands = [
        new SlashCommandBuilder().setName('list').setDescription('See the latest free games'),
        new SlashCommandBuilder().setName('scan').setDescription('Admin: Force a scan'),
        new SlashCommandBuilder()
            .setName('lang')
            .setDescription('Admin: Set the bot language for this server')
            .addStringOption((option) =>
                option
                    .setName('language')
                    .setDescription('Select the language')
                    .setRequired(true)
                    .addChoices(
                        { name: 'English', value: 'en' },
                        { name: 'Français', value: 'fr' },
                        { name: 'Español', value: 'es' },
                        { name: 'Português', value: 'pt' },
                        { name: 'Deutsch', value: 'de' },
                        { name: 'Italiano', value: 'it' },
                        { name: 'Русский', value: 'ru' }
                    )
            ),
        new SlashCommandBuilder()
            .setName('role')
            .setDescription('Admin: Set a custom role to ping instead of @everyone')
            .addRoleOption((option) =>
                option.setName('ping_role').setDescription('The role to ping').setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('toggle')
            .setDescription('Admin: Enable or disable alerts for a specific store')
            .addStringOption((option) =>
                option
                    .setName('store')
                    .setDescription('Store to toggle')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Steam', value: 'steam_on' },
                        { name: 'Epic Games', value: 'epic_on' },
                        { name: 'GOG', value: 'gog_on' }
                    )
            )
            .addBooleanOption((option) =>
                option
                    .setName('enabled')
                    .setDescription('True to receive games, False to ignore')
                    .setRequired(true)
            ),
    ].map((command) => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    } catch (error) {
        // A temporary command-registration failure must not take the bot down.
        console.error('Slash command registration failed:', error.message);
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
                        const can_ping =
                            ping_role === 'everyone'
                                ? permissions.has(PermissionsBitField.Flags.MentionEveryone)
                                : permissions.has(PermissionsBitField.Flags.MentionRoles);

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

async function auto_delete_expired() {
    const now_unix = Math.floor(Date.now() / 1000);

    try {
        const expired_deals = await run_query(
            db,
            `SELECT id, title FROM sent_deals
             WHERE notified = 1
               AND end_date IS NOT NULL
               AND end_date != 'null'
               AND CAST(end_date AS INTEGER) <= ?`,
            [now_unix]
        );

        for (const deal of expired_deals) {
            const messages = await run_query(
                db,
                'SELECT channel_id, message_id FROM deal_messages WHERE deal_id = ?',
                [deal.id]
            );

            for (const row of messages) {
                try {
                    const channel = await client.channels.fetch(row.channel_id);
                    if (!channel || !channel.isTextBased()) continue;

                    const message = await channel.messages.fetch(row.message_id);
                    const marker = `Deal ID: ${deal.id}`;
                    const updated_embeds = message.embeds.filter(
                        (embed) => !(embed.footer?.text || '').includes(marker)
                    );

                    if (updated_embeds.length === message.embeds.length) continue;

                    if (updated_embeds.length === 0) {
                        await message.delete();
                    } else {
                        await message.edit({ embeds: updated_embeds });
                    }
                } catch (error) {
                    console.warn(
                        `Could not update/delete message for "${deal.title}": ${error.message}`
                    );
                }
            }

            await run_exec(db, 'DELETE FROM deal_messages WHERE deal_id = ?', [deal.id]);
            // Keep the row so the website can keep showing the deal history.
        }
    } catch (error) {
        console.error('Error during auto-delete process:', error);
    }
}

client.once('clientReady', async () => {
    try {
        await ensure_schema(db);
        await register_commands();
        await update_guild_count();
        await resolve_owner_id();
        console.log(`${client.user.tag} online.`);
        client.user.setActivity('Scanning games...', { type: ActivityType.Watching });

        scan_loop();
        setInterval(() => scan_loop(), SCAN_INTERVAL);

        auto_delete_expired();
        setInterval(() => auto_delete_expired(), 60 * 60 * 1000);
    } catch (error) {
        console.error('FATAL ERROR: Could not initialize the bot!', error);
        process.exit(1);
    }
});

client.on('error', (error) => console.error('Discord client error:', error));

client.on('guildCreate', (guild) => {
    update_guild_count().catch((error) =>
        console.error('Could not update guild count:', error.message)
    );
});

client.on('guildDelete', (guild) => {
    run_exec(db, 'DELETE FROM guild_settings WHERE guild_id = ?', [guild.id])
        .then(() => update_guild_count())
        .catch((error) => console.error('Could not clean guild settings:', error.message));
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.guild) {
        return interaction.reply({
            content: 'This command can only be used in a server.',
            flags: MessageFlags.Ephemeral,
        });
    }

    let user_lang = interaction.locale;
    try {
        const rows = await run_query(
            db,
            'SELECT language FROM guild_settings WHERE guild_id = ?',
            [interaction.guild.id]
        );
        if (rows.length > 0) user_lang = rows[0].language;
    } catch (error) {
        console.warn(
            `Could not fetch guild language for ${interaction.guild.id}: ${error.message}`
        );
    }

    const owner_context = get_scan_context(interaction);

    const generate_embeds = (rows) =>
        rows.map((row) =>
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
                user_lang
            )
        );

    // /list
    if (interaction.commandName === 'list') {
        try {
            const rows = await run_query(
                db,
                ACTIVE_DEALS_SQL,
                [Math.floor(Date.now() / 1000)]
            );
            if (rows.length > 0) {
                await interaction.reply({
                    content: t('lastGames', user_lang),
                    embeds: generate_embeds(rows),
                });
            } else {
                await interaction.reply({ content: t('noGamesMemory', user_lang) });
            }
        } catch (error) {
            console.error('/list error:', error);
            await interaction.reply({
                content: t('scanError', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    // /scan
    else if (interaction.commandName === 'scan') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({
                content: t('adminOnly', user_lang),
                flags: MessageFlags.Ephemeral,
            });
            await notify_owner(
                build_owner_scan_embed(
                    'blocked',
                    user_lang,
                    null,
                    owner_context,
                    'ownerScanNoPermission'
                )
            );
            return;
        }

        const now = Date.now();
        const last_scan = await get_last_scan_time();
        const time_left = last_scan + SCAN_COOLDOWN - now;

        if (time_left > 0) {
            const minutes = Math.floor(time_left / 60000);
            const seconds = Math.floor((time_left % 60000) / 1000);
            const wait_msg = t('scanCooldown', user_lang)
                .replace('{min}', minutes)
                .replace('{sec}', seconds);
            await interaction.reply({
                content: wait_msg,
                flags: MessageFlags.Ephemeral,
            });
            await notify_owner(
                build_owner_scan_embed(
                    'blocked',
                    user_lang,
                    null,
                    owner_context,
                    'ownerScanCooldown'
                )
            );
            return;
        }

        if (scan_promise) {
            await interaction.reply({
                content: t('scanInProgress', user_lang),
                flags: MessageFlags.Ephemeral,
            });
            await notify_owner(
                build_owner_scan_embed(
                    'blocked',
                    user_lang,
                    null,
                    owner_context,
                    'scanInProgress'
                )
            );
            return;
        }

        await interaction.reply({ content: t('scanStart', user_lang) });

        try {
            await set_last_scan_time(now);
            await notify_owner(
                build_owner_scan_embed('started', user_lang, null, owner_context)
            );
            const summary = await scan_loop();
            await notify_owner(
                build_owner_scan_embed('finished', user_lang, summary, owner_context)
            );
            const rows = await run_query(
                db,
                ACTIVE_DEALS_SQL,
                [Math.floor(Date.now() / 1000)]
            );

            if (rows.length > 0) {
                await interaction.editReply({
                    content: `${t('scanDone', user_lang)}\n\n${t('lastGames', user_lang)}`,
                    embeds: generate_embeds(rows),
                });
            } else {
                await interaction.editReply({
                    content: `${t('scanDone', user_lang)}\n\n${t('noGamesMemory', user_lang)}`,
                });
            }
        } catch (error) {
            console.error('Manual Scan error:', error);
            await interaction.editReply({ content: t('scanError', user_lang) });
        }
    }

    // /lang
    else if (interaction.commandName === 'lang') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: t('adminOnly', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }

        const selected_lang = interaction.options.getString('language');

        try {
            await run_exec(
                db,
                `INSERT INTO guild_settings (guild_id, language) VALUES (?, ?)
                 ON CONFLICT(guild_id) DO UPDATE SET language = excluded.language`,
                [interaction.guild.id, selected_lang]
            );
            await interaction.reply({
                content: t('langUpdated', selected_lang),
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error('/lang error:', error);
            await interaction.reply({
                content: t('langError', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    // /role
    else if (interaction.commandName === 'role') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: t('adminOnly', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }

        const role = interaction.options.getRole('ping_role');

        if (!role) {
            return interaction.reply({
                content: t('scanError', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await run_exec(
                db,
                `INSERT INTO guild_settings (guild_id, ping_role) VALUES (?, ?)
                 ON CONFLICT(guild_id) DO UPDATE SET ping_role = excluded.ping_role`,
                [interaction.guild.id, role.id]
            );
            await interaction.reply({
                content: t('roleUpdated', user_lang).replace('{role}', `<@&${role.id}>`),
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error('/role error:', error);
            await interaction.reply({
                content: t('scanError', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    // /toggle
    else if (interaction.commandName === 'toggle') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: t('adminOnly', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }

        const store = interaction.options.getString('store');
        const enabled = interaction.options.getBoolean('enabled') ? 1 : 0;

        const ALLOWED_STORE_COLUMNS = ['steam_on', 'epic_on', 'gog_on'];
        if (!ALLOWED_STORE_COLUMNS.includes(store)) {
            return interaction.reply({
                content: t('adminOnly', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await run_exec(
                db,
                'INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT(guild_id) DO NOTHING',
                [interaction.guild.id]
            );
            await run_exec(
                db,
                `UPDATE guild_settings SET ${store} = ? WHERE guild_id = ?`,
                [enabled, interaction.guild.id]
            );
            const status = enabled ? 'ON' : 'OFF';
            await interaction.reply({
                content: t('toggleUpdated', user_lang)
                    .replace('{store}', store)
                    .replace('{status}', status),
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error('/toggle error:', error);
            await interaction.reply({
                content: t('scanError', user_lang),
                flags: MessageFlags.Ephemeral,
            });
        }
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    client.destroy();
    db.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Could not log in to Discord:', error);
    process.exit(1);
});
