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
const { ActivityType } = require('discord.js');

const { client, db, SCAN_INTERVAL } = require('./bot/context');
const { ensure_schema } = require('./lib/db');
const { register_commands, handle_interaction } = require('./bot/commands');
const { resolve_owner_id } = require('./bot/owner');
const { update_guild_count } = require('./bot/settings');
const { scan_loop } = require('./bot/scan');
const { auto_delete_expired } = require('./bot/cleanup');
const { register_guild_events, sync_all_guilds } = require('./bot/guilds');

client.once('clientReady', async () => {
    try {
        await ensure_schema(db);
        await register_commands();
        await update_guild_count();
        await resolve_owner_id();
        await sync_all_guilds();

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
client.on('interactionCreate', handle_interaction);

register_guild_events();

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    client.destroy();
    db.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Could not connect to Discord:', error);
    process.exit(1);
});
