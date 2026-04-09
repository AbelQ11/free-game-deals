const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType, REST, Routes, SlashCommandBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const path = require('path');
const langData = require('./lang.json');

const CLIENT_ID = "1466415254203404433";
const DB_NAME = path.join(__dirname, "deals_memory.db");

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ]
});

function t(key, locale) {
    const primaryLang = locale ? locale.split('-')[0] : 'en';
    const translationSet = langData[primaryLang] || langData['en'];
    return translationSet[key];
}

const db = new sqlite3.Database(DB_NAME, (err) => { if (err) console.error(err.message); });

function initDb() {
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
                                                      language TEXT
        )
    `);
}

function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' };
const COOKIES = 'steamCountry=FR|00; birthtime=946684801';

async function getFreeGames() {
    let newDeals = [];
    let foundIds = [];

    // --- 1. STEAM ---
    try {
        const steamUrl = "https://store.steampowered.com/search/?maxprice=free&specials=1";
        const response = await axios.get(steamUrl, { headers: { ...HEADERS, Cookie: COOKIES } });
        const $ = cheerio.load(response.data);
        const games = $('.search_result_row');

        for (let i = 0; i < games.length; i++) {
            try {
                const game = $(games[i]);
                const gameId = game.attr('data-ds-appid');
                if (!gameId) continue;
                foundIds.push(gameId);
                const title = game.find('.title').text();
                const fullText = game.text().trim().toLowerCase();

                if (["0,00€", "0.00€", "100%", "gratuit", "free"].some(k => fullText.includes(k))) {
                    const rows = await runQuery("SELECT 1 FROM sent_deals WHERE id = ?", [gameId]);
                    if (rows.length === 0) {
                        const link = `https://store.steampowered.com/app/${gameId}`;
                        const thumb = `https://cdn.cloudflare.steamstatic.com/steam/apps/${gameId}/header.jpg`;
                        const dateNow = new Date().toISOString().replace('T', ' ').substring(0, 16);

                        await runQuery("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [gameId, title, thumb, link, dateNow, null]);
                        newDeals.push({ title, link, thumb, store: "Steam", endDate: null });
                    }
                }
            } catch (err) { console.error(err); }
        }
    } catch (err) { console.error(err.message); }

    // --- 2. EPIC GAMES ---
    try {
        const epicUrl = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";
        const response = await axios.get(epicUrl);
        const elements = response.data.data.Catalog.searchStore.elements;

        for (const game of elements) {
            try {
                const isFree = game.price.totalPrice.discountPrice === 0;
                const promos = game.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
                const activePromo = promos.length > 0;

                if (isFree && activePromo) {
                    const gameId = "epic_" + game.id;
                    foundIds.push(gameId);

                    const rows = await runQuery("SELECT 1 FROM sent_deals WHERE id = ?", [gameId]);
                    if (rows.length === 0) {
                        const title = game.title;
                        const slug = game.catalogNs?.mappings?.[0]?.pageSlug || game.productSlug || game.urlSlug;
                        const link = `https://store.epicgames.com/p/${slug}`;
                        let thumb = "";
                        const image = game.keyImages.find(img => img.type === "OfferImageWide" || img.type === "Thumbnail");
                        if (image) thumb = image.url;

                        const endDateIso = promos[0].endDate;
                        const endDateUnix = Math.floor(new Date(endDateIso).getTime() / 1000);
                        const dateNow = new Date().toISOString().replace('T', ' ').substring(0, 16);

                        await runQuery("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [gameId, title, thumb, link, dateNow, endDateUnix]);
                        newDeals.push({ title, link, thumb, store: "Epic Games", endDate: endDateUnix });
                    }
                }
            } catch (err) { console.error(err); }
        }
    } catch (err) { console.error(err.message); }

    // --- 3. GOG ---
    try {
        const gogUrl = "https://www.gog.com/";
        const response = await axios.get(gogUrl, { headers: HEADERS });
        const $ = cheerio.load(response.data);

        const giveawayBanner = $('a[href*="/giveaway/claim"]');

        if (giveawayBanner.length > 0) {
            const rawLink = giveawayBanner.attr('href');
            const slug = rawLink.split('/').filter(Boolean).pop();
            const gameId = "gog_" + slug;
            foundIds.push(gameId);

            const rows = await runQuery("SELECT 1 FROM sent_deals WHERE id = ?", [gameId]);
            if (rows.length === 0) {
                let title = giveawayBanner.attr('title') || giveawayBanner.text().trim();

                if (!title || title.toLowerCase().includes('claim') || title.length < 3) {
                    title = slug.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                }

                const link = "https://www.gog.com/#giveaway";
                const thumb = "https://images.gog-statics.com/logo/gog_logo.svg";
                const dateNow = new Date().toISOString().replace('T', ' ').substring(0, 16);

                await runQuery("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [gameId, title, thumb, link, dateNow, null]);
                newDeals.push({ title, link, thumb, store: "GOG", endDate: null });
            }
        }
    } catch (err) { console.error("Erreur GOG:", err.message); }

    // --- 4. CLEANUP ---
    try {
        if (foundIds.length > 0) {
            const placeholders = foundIds.map(() => '?').join(',');
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM sent_deals WHERE id NOT IN (${placeholders})`, foundIds, function(err) {
                    if (err) reject(err); else resolve();
                });
            });
        }
    } catch (err) { console.error(err); }

    return newDeals;
}

async function registerCommands() {
    const commands = [
        new SlashCommandBuilder().setName('list').setDescription('See the latest free games'),
        new SlashCommandBuilder().setName('scan').setDescription('Admin: Force a scan'),
        new SlashCommandBuilder()
            .setName('lang')
            .setDescription('Admin: Set the bot language for this server')
            .addStringOption(option =>
                option.setName('language')
                    .setDescription('Select the language / Choisissez la langue')
                    .setRequired(true)
                    .addChoices(
                        { name: '🇬🇧 English', value: 'en' },
                        { name: '🇫🇷 Français', value: 'fr' },
                        { name: '🇪🇸 Español', value: 'es' },
                        { name: '🇩🇪 Deutsch', value: 'de' },
                        { name: '🇮🇹 Italiano', value: 'it' },
                        { name: '🇷🇺 Русский', value: 'ru' }
                    )
            )
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (error) { console.error(error); }
}

client.once('ready', async () => {
    initDb();
    await registerCommands();
    console.log(`✅ ${client.user.tag} online.`);
    client.user.setActivity('Scanning games... 🎮', { type: ActivityType.Watching });
    scanLoop();
    setInterval(scanLoop, 1800000);
});

async function scanLoop() {
    const newGames = await getFreeGames();
    if (newGames.length > 0) {

        const guildSettings = await runQuery("SELECT guild_id, language FROM guild_settings");
        const langMap = {};
        guildSettings.forEach(row => langMap[row.guild_id] = row.language);

        // 2. Envoyer les messages
        for (const game of newGames) {
            client.guilds.cache.forEach(async (guild) => {
                try {
                    const channel = guild.channels.cache.find(c => c.name === 'free-games');
                    if (channel && channel.isTextBased()) {

                        // Détermine la langue : Choix forcé en DB > ou Langue du serveur > ou Anglais par défaut
                        const serverLang = langMap[guild.id] || guild.preferredLocale || 'en';

                        let description = t('newGameDesc', serverLang).replace('{link}', game.link).replace('{store}', game.store);

                        if (game.endDate) {
                            description += `${t('endDateMsg', serverLang)} <t:${game.endDate}:F>`;
                        }

                        let storeColor = '#66c0f4';
                        if (game.store === 'Epic Games') storeColor = '#ffffff';
                        if (game.store === 'GOG') storeColor = '#c1318f';

                        const dealEmbed = new EmbedBuilder()
                            .setTitle(`${t('newGameTitle', serverLang)} : ${game.title}`)
                            .setURL(game.link)
                            .setImage(game.thumb)
                            .setColor(storeColor)
                            .setDescription(description)
                            .setFooter({ text: 'Free Game Deals', iconURL: client.user.displayAvatarURL() })
                            .setTimestamp();

                        await channel.send({ embeds: [dealEmbed] });
                    }
                } catch (err) { console.error(err); }
            });
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    let userLang = interaction.locale;
    try {
        const rows = await runQuery("SELECT language FROM guild_settings WHERE guild_id = ?", [interaction.guild.id]);
        if (rows.length > 0) userLang = rows[0].language;
    } catch (e) {}

    // --- COMMANDE : /list ---
    if (interaction.commandName === 'list') {
        try {
            const rows = await runQuery("SELECT title, link FROM sent_deals ORDER BY date DESC LIMIT 5");
            if (rows.length > 0) {
                const gamesList = rows.map(r => `• ${r.title} (<${r.link}>)`).join('\n');
                await interaction.reply(`${t('lastGames', userLang)}${gamesList}`);
            } else { await interaction.reply(t('noGamesMemory', userLang)); }
        } catch (err) { await interaction.reply("Error."); }
    }

    // --- COMMANDE : /scan ---
    else if (interaction.commandName === 'scan') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: t('adminOnly', userLang), ephemeral: true });
        await interaction.reply(t('scanStart', userLang));
        try {
            await scanLoop();
            const rows = await runQuery("SELECT title, link FROM sent_deals ORDER BY date DESC LIMIT 5");
            let list = rows.length > 0 ? "\n\n" + t('lastGames', userLang) + rows.map(r => `• ${r.title} (<${r.link}>)`).join('\n') : "\n\n" + t('noGamesMemory', userLang);
            await interaction.editReply(t('scanDone', userLang) + list);
        } catch (err) { await interaction.editReply(t('scanError', userLang)); }
    }

    // --- COMMANDE : /lang ---
    else if (interaction.commandName === 'lang') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: t('adminOnly', userLang), ephemeral: true });

        const selectedLang = interaction.options.getString('language');

        // INSERT OR REPLACE est parfait pour créer la ligne si elle n'existe pas, ou la mettre à jour si elle existe
        db.run("INSERT OR REPLACE INTO guild_settings (guild_id, language) VALUES (?, ?)", [interaction.guild.id, selectedLang], async function(err) {
            if (err) {
                console.error(err);
                await interaction.reply({ content: t('langError', userLang), ephemeral: true });
            } else {
                await interaction.reply({ content: t('langUpdated', selectedLang), ephemeral: true });
            }
        });
    }
});

client.login(process.env.DISCORD_TOKEN);