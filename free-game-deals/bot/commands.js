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
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    MessageFlags,
} = require('discord.js');

const { db, CLIENT_ID, SCAN_COOLDOWN } = require('./context');
const { run_query, run_exec } = require('../lib/db');
const { t, ACTIVE_DEALS_SQL, generate_embeds } = require('./embeds');
const {
    get_last_manual_scan_time,
    set_last_manual_scan_time,
} = require('./settings');
const { scan_loop, is_scan_running } = require('./scan');
const {
    notify_owner,
    update_owner_notification,
    get_scan_context,
    build_owner_scan_embed,
} = require('./owner');

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

async function handle_interaction(interaction) {
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
    const build_embeds = (rows) => generate_embeds(rows, user_lang);

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
                    embeds: build_embeds(rows),
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
        return;
    }

    // /scan
    if (interaction.commandName === 'scan') {
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
        const last_manual_scan = await get_last_manual_scan_time();
        const time_left = last_manual_scan + SCAN_COOLDOWN - now;

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

        if (is_scan_running()) {
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

        let notification = null;
        try {
            await set_last_manual_scan_time(now);
            notification = await notify_owner(
                build_owner_scan_embed('started', user_lang, null, owner_context)
            );
            const summary = await scan_loop();
            await update_owner_notification(
                notification,
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
                    embeds: build_embeds(rows),
                });
            } else {
                await interaction.editReply({
                    content: `${t('scanDone', user_lang)}\n\n${t('noGamesMemory', user_lang)}`,
                });
            }
        } catch (error) {
            console.error('Manual Scan error:', error);
            await update_owner_notification(
                notification,
                build_owner_scan_embed(
                    'failed',
                    user_lang,
                    null,
                    owner_context,
                    'scanError',
                    error.message
                )
            );
            await interaction.editReply({ content: t('scanError', user_lang) });
        }
        return;
    }

    // /lang
    if (interaction.commandName === 'lang') {
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
        return;
    }

    // /role
    if (interaction.commandName === 'role') {
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
        return;
    }

    // /toggle
    if (interaction.commandName === 'toggle') {
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
}

module.exports = {
    register_commands,
    handle_interaction,
};
