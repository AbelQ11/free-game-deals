const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType, REST, Routes, SlashCommandBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cheerio = require('cheerio');

const TOKEN = TOKEN;
const CLIENT_ID = "1466415254203404433"; 
const DB_NAME = "deals_memory.db";

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ]
});

const i18n = {
    'fr': {
        newGameTitle: '🆓 JEU GRATUIT',
        newGameDesc: "@everyone Un nouveau jeu est actuellement gratuit à 100% sur **{store}** !\n\n🎮 **[Cliquez ici pour l'ajouter]({link})**\n\n🌐 *[Voir l'historique](https://free-game-deals.duckdns.org/)*",
        noGamesMemory: "Aucun jeu en mémoire pour le moment.",
        lastGames: "**Derniers jeux gratuits trouvés :**\n",
        scanStart: "⏳ Début du scan manuel en cours...",
        scanDone: "@everyone ✅ Scan global terminé !",
        scanError: "❌ Une erreur est survenue pendant le scan.",
        adminOnly: "❌ Seuls les administrateurs peuvent forcer un scan global.",
        endDateMsg: "\n\n⏳ **Fin de l'offre :** "
    },
    'en-US': {
        newGameTitle: '🆓 FREE GAME',
        newGameDesc: "@everyone A new game is currently 100% free on **{store}**!\n\n🎮 **[Click here to claim it]({link})**\n\n🌐 *[View full history](https://free-game-deals.duckdns.org/)*",
        noGamesMemory: "No games in memory yet.",
        lastGames: "**Last free games found:**\n",
        scanStart: "⏳ Manual scan starting...",
        scanDone: "@everyone ✅ Global scan complete!",
        scanError: "❌ An error occurred during the scan.",
        adminOnly: "❌ Only administrators can force a global scan.",
        endDateMsg: "\n\n⏳ **Offer ends:** "
    }
};

function t(key, locale) {
    const lang = i18n[locale] ? locale : 'en-US';
    return i18n[lang][key];
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
            const gameId = "gog_giveaway_active"; 
            foundIds.push(gameId);

            const rows = await runQuery("SELECT 1 FROM sent_deals WHERE id = ?", [gameId]);
            if (rows.length === 0) {
                const title = "New GOG.com Giveaway!";
                const link = "https://www.gog.com/#giveaway";
                const thumb = "https://images.gog-statics.com/logo/gog_logo.svg"; 
                const dateNow = new Date().toISOString().replace('T', ' ').substring(0, 16);

                await runQuery("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?, ?)", [gameId, title, thumb, link, dateNow, null]);
                newDeals.push({ title, link, thumb, store: "GOG", endDate: null });
            }
        }
    } catch (err) { console.error(err.message); }

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
        new SlashCommandBuilder().setName('scan').setDescription('Admin: Force a scan')
    ].map(command => command.toJSON());
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (error) { console.error(error); }
}

client.once('ready', async () => {
    initDb();
    await registerCommands();
    console.log(`✅ ${client.user.tag} online.`);
    client.user.setActivity('Scanning games... 🎮', { type: ActivityType.Watching });
    scanLoop();
    setInterval(scanLoop, 3600000); 
});

async function scanLoop() {
    const newGames = await getFreeGames();
    if (newGames.length > 0) {
        for (const game of newGames) {
            client.guilds.cache.forEach(async (guild) => {
                try {
                    const channel = guild.channels.cache.find(c => c.name === 'free-games');
                    if (channel && channel.isTextBased()) {
                        const serverLang = guild.preferredLocale; 
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
    const userLang = interaction.locale; 
    if (interaction.commandName === 'list') {
        try {
            const rows = await runQuery("SELECT title, link FROM sent_deals ORDER BY date DESC LIMIT 5");
            if (rows.length > 0) {
                const gamesList = rows.map(r => `• ${r.title} (<${r.link}>)`).join('\n');
                await interaction.reply(`${t('lastGames', userLang)}${gamesList}`);
            } else { await interaction.reply(t('noGamesMemory', userLang)); }
        } catch (err) { await interaction.reply("Error."); }
    } else if (interaction.commandName === 'scan') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: t('adminOnly', userLang), ephemeral: true }); 
        await interaction.reply(t('scanStart', userLang));
        try {
            await scanLoop(); 
            const rows = await runQuery("SELECT title, link FROM sent_deals ORDER BY date DESC LIMIT 5");
            let list = rows.length > 0 ? "\n\n" + t('lastGames', userLang) + rows.map(r => `• ${r.title} (<${r.link}>)`).join('\n') : "\n\n" + t('noGamesMemory', userLang);
            await interaction.editReply(t('scanDone', userLang) + list);
        } catch (err) { await interaction.editReply(t('scanError', userLang)); }
    }
});

client.login(TOKEN);
