const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const path = require('path');
const lang_data = require('./lang.json');

const scrape_steam = require('./scrapers/steam.js');
const scrape_epic = require('./scrapers/epic_games.js');
const scrape_gog = require('./scrapers/gog.js');

let last_global_scan_time = 0;
const SCAN_COOLDOWN = 15 * 60 * 1000;

const CLIENT_ID = "1466415254203404433";
const DB_NAME = path.join(__dirname, "deals_memory.db");

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ]
});

function t(key, locale) {
    const primary_lang = locale ? locale.split('-')[0] : 'en';
    const translation_set = lang_data[primary_lang] || lang_data['en'];
    return translation_set[key];
}

const db = new sqlite3.Database(DB_NAME, (err) => { if (err) console.error(err.message); });

function init_db() {
    db.run(`
        CREATE TABLE IF NOT EXISTS sent_deals (
                                                  id TEXT PRIMARY KEY,
                                                  title TEXT,
                                                  thumb TEXT,
                                                  link TEXT,
                                                  date TEXT,
                                                  end_date TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS guild_settings (
                                                      guild_id TEXT PRIMARY KEY,
                                                      language TEXT DEFAULT 'en'
        )
    `);

    db.run("ALTER TABLE guild_settings ADD COLUMN ping_role TEXT DEFAULT 'everyone'", () => {});
    db.run("ALTER TABLE guild_settings ADD COLUMN steam_on INTEGER DEFAULT 1", () => {});
    db.run("ALTER TABLE guild_settings ADD COLUMN epic_on INTEGER DEFAULT 1", () => {});
    db.run("ALTER TABLE guild_settings ADD COLUMN gog_on INTEGER DEFAULT 1", () => {});
}

function run_query(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

async function get_free_games() {
    let all_new_deals = [];
    let all_found_ids = [];

    const [steam_data, epic_data, gog_data] = await Promise.all([
        scrape_steam(run_query),
        scrape_epic(run_query),
        scrape_gog(run_query)
    ]);

    all_new_deals.push(...steam_data.new_deals, ...epic_data.new_deals, ...gog_data.new_deals);
    all_found_ids.push(...steam_data.found_ids, ...epic_data.found_ids, ...gog_data.found_ids);

    try {
        if (all_found_ids.length > 0) {
            const placeholders = all_found_ids.map(() => '?').join(',');
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM sent_deals WHERE id NOT IN (${placeholders})`, all_found_ids, function(err) {
                    if (err) reject(err); else resolve();
                });
            });
        }
    } catch (err) { console.error("Cleanup Error:", err); }

    return all_new_deals;
}

async function register_commands() {
    const commands = [
        new SlashCommandBuilder().setName('list').setDescription('See the latest free games'),
        new SlashCommandBuilder().setName('scan').setDescription('Admin: Force a scan'),
        new SlashCommandBuilder()
            .setName('lang')
            .setDescription('Admin: Set the bot language for this server')
            .addStringOption(option => option.setName('language').setDescription('Select the language').setRequired(true)
                .addChoices(
                    { name: 'English', value: 'en' }, { name: 'Français', value: 'fr' },
                    { name: 'Español', value: 'es' }, { name: 'Português', value: 'pt'},
                    { name: 'Deutsch', value: 'de' }, { name: 'Italiano', value: 'it' }, { name: 'Русский', value: 'ru' }
                )),
        new SlashCommandBuilder()
            .setName('role')
            .setDescription('Admin: Set a custom role to ping instead of @everyone')
            .addRoleOption(option => option.setName('ping_role').setDescription('The role to ping').setRequired(true)),
        new SlashCommandBuilder()
            .setName('toggle')
            .setDescription('Admin: Enable or disable alerts for a specific store')
            .addStringOption(option => option.setName('store').setDescription('Store to toggle').setRequired(true)
                .addChoices(
                    { name: 'Steam', value: 'steam_on' },
                    { name: 'Epic Games', value: 'epic_on' },
                    { name: 'GOG', value: 'gog_on' }
                ))
            .addBooleanOption(option => option.setName('enabled').setDescription('True to receive games, False to ignore').setRequired(true))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (error) { console.error("Command Registration", error); }
}

client.once('ready', async () => {
    init_db();
    await register_commands();
    console.log(`${client.user.tag} online.`);
    client.user.setActivity('Scanning games...', { type: ActivityType.Watching });
    scan_loop();
    setInterval(scan_loop, 1800000);
});

async function scan_loop() {
    const new_games = await get_free_games();
    if (new_games.length > 0) {

        const guild_settings = await run_query("SELECT * FROM guild_settings");
        const conf_map = {};
        guild_settings.forEach(row => conf_map[row.guild_id] = row);

        for (const game of new_games) {
            client.guilds.cache.forEach(async (guild) => {
                try {
                    const conf = conf_map[guild.id] || { language: 'en', ping_role: 'everyone', steam_on: 1, epic_on: 1, gog_on: 1 };

                    if (game.store === 'Steam' && conf.steam_on === 0) return;
                    if (game.store === 'Epic Games' && conf.epic_on === 0) return;
                    if (game.store === 'GOG' && conf.gog_on === 0) return;

                    const channel = guild.channels.cache.find(c => c.name === 'free-games');
                    if (channel && channel.isTextBased()) {
                        const server_lang = conf.language || guild.preferredLocale || 'en';

                        const ping_text = conf.ping_role === 'everyone' ? '@everyone' : `<@&${conf.ping_role}>`;

                        let description = t('newGameDesc', server_lang).replace('{store}', game.store);
                        if (game.end_date) {
                            description += `\n\n${t('endDateMsg', server_lang)} <t:${game.end_date}:F>`;
                        }

                        let store_color = '#66c0f4';
                        if (game.store === 'Epic Games') store_color = '#ffffff';
                        if (game.store === 'GOG') store_color = '#c1318f';

                        const deal_embed = new EmbedBuilder()
                            .setTitle(`${t('newGameTitle', server_lang)} : ${game.title}`)
                            .setImage(game.thumb)
                            .setColor(store_color)
                            .setDescription(description)
                            .setFooter({ text: 'Free Game Deals', iconURL: client.user.displayAvatarURL() })
                            .setTimestamp();

                        const claim_btn = new ButtonBuilder()
                            .setLabel(t('claimBtn', server_lang))
                            .setURL(game.link)
                            .setStyle(ButtonStyle.Link);

                        const history_btn = new ButtonBuilder()
                            .setLabel(t('historyBtn', server_lang))
                            .setURL('https://free-game-deals.duckdns.org')
                            .setStyle(ButtonStyle.Link);

                        const action_row = new ActionRowBuilder().addComponents(claim_btn, history_btn);

                        await channel.send({ content: ping_text, embeds: [deal_embed], components: [action_row] });
                    }
                } catch (err) { console.error(`Send Alert Error (Guild: ${guild.id})`, err); }
            });
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    let user_lang = interaction.locale;
    try {
        const rows = await run_query("SELECT language FROM guild_settings WHERE guild_id = ?", [interaction.guild.id]);
        if (rows.length > 0) user_lang = rows[0].language;
    } catch (e) {}

    const generate_embeds = (rows) => {
        return rows.map(row => {
            let store = 'Steam';
            let store_color = '#66c0f4';
            if (row.link.includes('epicgames.com')) {
                store = 'Epic Games';
                store_color = '#ffffff';
            } else if (row.link.includes('gog.com')) {
                store = 'GOG';
                store_color = '#c1318f';
            }

            let description = t('newGameDesc', user_lang).replace('{store}', store);
            if (row.end_date && row.end_date !== 'null') {
                description += `\n\n${t('endDateMsg', user_lang)} <t:${row.end_date}:F>`;
            }

            return new EmbedBuilder()
                .setTitle(`${t('newGameTitle', user_lang)} : ${row.title}`)
                .setURL(row.link)
                .setThumbnail(row.thumb)
                .setColor(store_color)
                .setDescription(description);
        });
    };

    // /list
    if (interaction.commandName === 'list') {
        try {
            const rows = await run_query("SELECT * FROM sent_deals ORDER BY date DESC LIMIT 5");
            if (rows.length > 0) {
                const embeds = generate_embeds(rows);
                await interaction.reply({ content: t('lastGames', user_lang), embeds: embeds });
            } else {
                await interaction.reply({ content: t('noGamesMemory', user_lang) });
            }
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "Error.", ephemeral: true });
        }
    }

    // /scan
    else if (interaction.commandName === 'scan') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: t('adminOnly', user_lang), ephemeral: true });
        }

        const now = Date.now();
        const time_left = last_global_scan_time + SCAN_COOLDOWN - now;

        if (time_left > 0) {
            const minutes = Math.floor(time_left / 60000);
            const seconds = Math.floor((time_left % 60000) / 1000);

            const wait_msg = t('scanCooldown', user_lang)
                .replace('{min}', minutes)
                .replace('{sec}', seconds);

            return interaction.reply({ content: wait_msg, ephemeral: true });
        }

        await interaction.reply({ content: t('scanStart', user_lang) });
        last_global_scan_time = now;

        try {
            await scan_loop();
            const rows = await run_query("SELECT * FROM sent_deals ORDER BY date DESC LIMIT 5");

            if (rows.length > 0) {
                const embeds = generate_embeds(rows);
                await interaction.editReply({ content: `${t('scanDone', user_lang)}\n\n${t('lastGames', user_lang)}`, embeds: embeds });
            } else {
                await interaction.editReply({ content: `${t('scanDone', user_lang)}\n\n${t('noGamesMemory', user_lang)}` });
            }
        } catch (err) {
            console.error("Manual Scan", err);
            await interaction.editReply({ content: t('scanError', user_lang) });
        }
    }

    // /lang
    else if (interaction.commandName === 'lang') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: t('adminOnly', user_lang), ephemeral: true });

        const selected_lang = interaction.options.getString('language');

        db.run("INSERT OR REPLACE INTO guild_settings (guild_id, language) VALUES (?, ?)", [interaction.guild.id, selected_lang], async function(err) {
            if (err) {
                console.error("Lang Update", err);
                await interaction.reply({ content: t('langError', user_lang), ephemeral: true });
            } else {
                await interaction.reply({ content: t('langUpdated', selected_lang), ephemeral: true });
            }
        });
    }

    // /role
    else if (interaction.commandName === 'role') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: t('adminOnly', user_lang), ephemeral: true });

        const role = interaction.options.getRole('ping_role');

        db.run("INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)", [interaction.guild.id], () => {
            db.run("UPDATE guild_settings SET ping_role = ? WHERE guild_id = ?", [role.id, interaction.guild.id], async (err) => {
                if (err) return interaction.reply({ content: "Error.", ephemeral: true });
                await interaction.reply({ content: t('roleUpdated', user_lang).replace('{role}', `<@&${role.id}>`), ephemeral: true });
            });
        });
    }

    // /toggle
    else if (interaction.commandName === 'toggle') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: t('adminOnly', user_lang), ephemeral: true });

        const store = interaction.options.getString('store');
        const enabled = interaction.options.getBoolean('enabled') ? 1 : 0;

        db.run("INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)", [interaction.guild.id], () => {
            db.run(`UPDATE guild_settings SET ${store} = ? WHERE guild_id = ?`, [enabled, interaction.guild.id], async (err) => {
                if (err) return interaction.reply({ content: "Error.", ephemeral: true });
                const status = enabled ? "ON" : "OFF";
                await interaction.reply({ content: t('toggleUpdated', user_lang).replace('{store}', store).replace('{status}', status), ephemeral: true });
            });
        });
    }
});

client.login(process.env.DISCORD_TOKEN);