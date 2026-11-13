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
const { client, db } = require('./context');
const { run_exec } = require('../lib/db');
const { update_guild_count } = require('./settings');

function guild_roles(guild) {
    return [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .slice(0, 100)
        .map((role) => ({
            id: role.id,
            name: role.name,
        }));
}

async function sync_guild(guild) {
    if (!guild || !guild.id) return;

    await run_exec(
        db,
        `INSERT INTO guilds (guild_id, name, icon, owner_id, roles, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
            name = excluded.name,
            icon = excluded.icon,
            owner_id = excluded.owner_id,
            roles = excluded.roles,
            updated_at = excluded.updated_at`,
        [
            String(guild.id),
            guild.name || 'Discord server',
            guild.icon || null,
            guild.ownerId ? String(guild.ownerId) : null,
            JSON.stringify(guild_roles(guild)),
            new Date().toISOString(),
        ]
    );
}

async function ensure_default_settings(guild_id) {
    await run_exec(
        db,
        'INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)',
        [String(guild_id)]
    );
}

async function remove_guild(guild_id) {
    await run_exec(db, 'DELETE FROM guilds WHERE guild_id = ?', [String(guild_id)]);
    await run_exec(db, 'DELETE FROM guild_settings WHERE guild_id = ?', [String(guild_id)]);
}

async function sync_all_guilds() {
    for (const guild of client.guilds.cache.values()) {
        try {
            await sync_guild(guild);
            await ensure_default_settings(guild.id);
        } catch (error) {
            console.warn(`Could not sync guild ${guild.id}:`, error.message);
        }
    }
    await update_guild_count();
}

function register_guild_events() {
    client.on('guildCreate', async (guild) => {
        try {
            await sync_guild(guild);
            await ensure_default_settings(guild.id);
            await update_guild_count();
        } catch (error) {
            console.error('Could not register new guild:', error.message);
        }
    });

    client.on('guildDelete', async (guild) => {
        try {
            await remove_guild(guild.id);
            await update_guild_count();
        } catch (error) {
            console.error('Could not clean deleted guild:', error.message);
        }
    });

    client.on('guildUpdate', (_oldGuild, newGuild) => {
        sync_guild(newGuild).catch((error) =>
            console.warn(`Could not update guild ${newGuild.id}:`, error.message)
        );
    });

    for (const event of ['roleCreate', 'roleUpdate', 'roleDelete']) {
        client.on(event, (role) => {
            if (!role?.guild) return;
            sync_guild(role.guild).catch((error) =>
                console.warn(`Could not update roles for ${role.guild.id}:`, error.message)
            );
        });
    }
}

module.exports = {
    sync_guild,
    ensure_default_settings,
    remove_guild,
    sync_all_guilds,
    register_guild_events,
};
