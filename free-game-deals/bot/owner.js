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

const { client } = require('./context');
const { t, truncate } = require('./embeds');

let owner_id = /^\d+$/.test(process.env.OWNER_ID || '') ? process.env.OWNER_ID : null;
const OWNER_LOG_CHANNEL_ID = /^\d+$/.test(process.env.OWNER_LOG_CHANNEL_ID || '')
    ? process.env.OWNER_LOG_CHANNEL_ID
    : null;

async function resolve_owner_id() {
    if (!owner_id) {
        try {
            const application = await client.application.fetch();
            const owner = application.owner;
            const resolved = owner && (owner.ownerId || owner.id);
            if (resolved) owner_id = String(resolved);
        } catch (error) {
            console.warn('Could not resolve the Discord application owner:', error.message);
        }
    }

    if (!owner_id) {
        console.warn(
            'Owner scan notifications are disabled: set OWNER_ID in .env to enable them.'
        );
        return owner_id;
    }

    try {
        const user = await client.users.fetch(owner_id);
        console.log(`Owner scan notifications enabled for ${user.tag} (${owner_id}).`);
    } catch (error) {
        console.log(`Owner scan notifications enabled for ${owner_id}.`);
    }

    return owner_id;
}

async function send_dm(embed) {
    if (!owner_id) return null;

    try {
        const user = await client.users.fetch(owner_id);
        return await user.send({ embeds: [embed] });
    } catch (error) {
        // Closed DMs must never break a scan.
        console.warn('Owner scan notification failed:', error.message);
        return null;
    }
}

async function send_log(embed) {
    if (!OWNER_LOG_CHANNEL_ID) return null;

    try {
        const channel = await client.channels.fetch(OWNER_LOG_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) return null;
        return await channel.send({
            content: owner_id ? `<@${owner_id}>` : undefined,
            embeds: [embed],
            allowedMentions: owner_id ? { users: [owner_id] } : { parse: [] },
        });
    } catch (error) {
        console.warn('Owner log channel notification failed:', error.message);
        return null;
    }
}

async function notify_owner(embed) {
    const dm = await send_dm(embed);
    const log = await send_log(embed);
    return { dm, log };
}

async function update_owner_notification(state, embed) {
    let dm = state?.dm || null;
    let log = state?.log || null;

    if (dm) {
        try {
            await dm.edit({ embeds: [embed] });
        } catch (error) {
            console.warn('Could not edit the owner DM:', error.message);
            dm = await send_dm(embed);
        }
    } else {
        dm = await send_dm(embed);
    }

    if (OWNER_LOG_CHANNEL_ID) {
        if (log) {
            try {
                await log.edit({
                    content: owner_id ? `<@${owner_id}>` : undefined,
                    embeds: [embed],
                    allowedMentions: owner_id ? { users: [owner_id] } : { parse: [] },
                });
            } catch (error) {
                console.warn('Could not edit the owner log message:', error.message);
                log = await send_log(embed);
            }
        } else {
            log = await send_log(embed);
        }
    }

    return { dm, log };
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
    reason_key = null,
    error_message = null
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

    if (kind === 'failed') {
        return embed
            .setColor('#ef4444')
            .setTitle(t('ownerScanFailedTitle', lang))
            .setDescription(t('ownerScanFailedDesc', lang))
            .addFields(
                ...context_fields,
                {
                    name: t('ownerScanReason', lang),
                    value: truncate(error_message || t('scanError', lang), 500),
                    inline: false,
                }
            );
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

module.exports = {
    resolve_owner_id,
    notify_owner,
    update_owner_notification,
    get_scan_context,
    build_owner_scan_embed,
};
