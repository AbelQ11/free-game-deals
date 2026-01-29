import discord
from discord.ext import commands, tasks
import sqlite3
import datetime
import requests
from bs4 import BeautifulSoup

# --- CONFIGURATION ---
TOKEN = "DISCORD_TOKEN" #The Token is not here because it is private
DB_NAME = "/home/ubuntu/deals_memory.db"


intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr-FR'}
COOKIES = {'steamCountry': 'FR|00', 'birthtime': '946684801'}

def get_free_games():
    url = "https://store.steampowered.com/search/?maxprice=free&specials=1"
    new_deals = []
    try:
        r = requests.get(url, headers=HEADERS, cookies=COOKIES)
        soup = BeautifulSoup(r.text, 'html.parser')
        games = soup.find_all('a', class_='search_result_row')

        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()

        for game in games:
            title = game.find('span', class_='title').text
            game_id = game['data-ds-appid']
            full_text = game.get_text(" ", strip=True).lower()

            if any(k in full_text for k in ["0,00€", "0.00€", "100%", "gratuit"]):
                cursor.execute("SELECT 1 FROM sent_deals WHERE id = ?", (game_id,))
                if not cursor.fetchone():
                    link = f"https://store.steampowered.com/app/{game_id}"
                    thumb = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{game_id}/header.jpg"
                    date_now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

                    cursor.execute("INSERT INTO sent_deals VALUES (?, ?, ?, ?, ?)", (game_id, title, thumb, link, date_now))
                    new_deals.append({"title": title, "link": link, "thumb": thumb})

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erreur Scan: {e}")
    return new_deals


@bot.event
async def on_ready():
    print(f"✅ Bot connecté en tant que {bot.user}")
    scan_loop.start()

@tasks.loop(minutes=60)
async def scan_loop():
    print("🔍 Scan automatique en cours...")
    new_games = get_free_games()

    if new_games:
        for guild in bot.guilds:
            channel = discord.utils.get(guild.text_channels, name="free-games")
            if channel:
                for game in new_games:
                    embed = discord.Embed(title=f"🎁 JEU GRATUIT : {game['title']}", url=game['link'], color=discord.Color.green())
                    embed.set_thumbnail(url=game['thumb'])
                    embed.set_footer(text="VaporDrop Bot • Ajoute-moi sur ton serveur !")
                    await channel.send(embed=embed)

@bot.command()
async def invite(ctx):
    link = f"https://discord.com/api/oauth2/authorize?client_id={bot.user.id}&permissions=2048&scope=bot"
    await ctx.send(f"Tu peux m'inviter sur ton serveur avec ce lien : {link}")

@bot.command()
async def list(ctx):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT title, link FROM sent_deals ORDER BY date DESC LIMIT 5")
    rows = cursor.fetchall()
    conn.close()

    if rows:
        msg = "**Derniers jeux gratuits trouvés :**\n" + "\n".join([f"• {r[0]} (<{r[1]}>)" for r in rows])
    else:
        msg = "Aucun jeu en mémoire."
    await ctx.send(msg)

bot.run(TOKEN)