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
const { run_query, run_exec } = require('../lib/db');

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

module.exports = { auto_delete_expired };
