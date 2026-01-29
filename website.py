from flask import Flask, render_template_string, url_for
import sqlite3

app = Flask(__name__)
DB_NAME = "/home/ubuntu/deals_memory.db"

CLIENT_ID = "1466415254203404433"
INVITE_LINK = f"https://discord.com/api/oauth2/authorize?client_id={CLIENT_ID}&permissions=274877906944&scope=bot"

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
    <title>Free Game Deals | Chasseur de Jeux Gratuits</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <link rel="icon" type="image/jpeg" href="{{ url_for('static', filename='favicon.jpg') }}">

    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">

    <style>
        /* --- VARIABLES --- */
        :root {
            --primary: #66c0f4;
            --accent: #5865F2;
            --bg: #0b0e14;
            --card-bg: #151a24;
            --text: #e0e6ed;
            --text-muted: #8899a6;
            --border: #2d3748;
            --nav-bg: rgba(11, 14, 20, 0.95);
            --shadow: 0 4px 20px rgba(0,0,0,0.4);
        }

        [data-theme="light"] {
            --primary: #0078d4;
            --accent: #5865F2;
            --bg: #f3f4f6;
            --card-bg: #ffffff;
            --text: #1f2937;
            --text-muted: #6b7280;
            --border: #e5e7eb;
            --nav-bg: rgba(255, 255, 255, 0.95);
            --shadow: 0 4px 20px rgba(0,0,0,0.1);
        }

        * { box-sizing: border-box; transition: background-color 0.3s, color 0.3s; }
        body { background-color: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; margin: 0; padding-top: 80px; }
        .container { max-width: 1100px; margin: auto; padding: 0 20px; }

        /* --- NAVBAR --- */
        nav {
            position: fixed; top: 0; left: 0; right: 0; height: 70px;
            background: var(--nav-bg); backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--border);
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 5%; z-index: 1000;
        }
        .logo { font-weight: 700; font-size: 1.5em; color: var(--primary); text-decoration: none; display: flex; align-items: center; gap: 10px; }

        .nav-items { display: flex; align-items: center; gap: 15px; }

        /* --- BOUTONS --- */
        .btn {
            padding: 10px 20px; border-radius: 8px; font-weight: 600; text-decoration: none;
            cursor: pointer; border: none; display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.2s;
        }
        .btn:hover { transform: translateY(-2px); }
        .btn-discord { background: var(--accent); color: white; }
        .btn-theme { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 12px; font-size: 1.2em; }

        /* 2. STYLE DE L'IMAGE DANS LE BOUTON */
        .btn-icon-img {
            width: 24px; height: 24px;
            border-radius: 50%; /* Image ronde */
            margin-right: 10px;
            object-fit: cover;
            border: 2px solid rgba(255,255,255,0.3);
        }

        /* --- HEADER --- */
        header { text-align: center; padding: 60px 20px; }
        h1 { font-size: 3em; margin: 0 0 10px; background: linear-gradient(135deg, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { color: var(--text-muted); font-size: 1.2em; margin-bottom: 30px; }

        /* --- GUIDE --- */
        .setup-box {
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 16px; padding: 30px; margin: 40px auto; max-width: 800px;
            text-align: center; box-shadow: var(--shadow);
        }
        .steps { display: flex; flex-wrap: wrap; justify-content: center; gap: 30px; margin-top: 20px; }
        .step { flex: 1; min-width: 200px; }
        .step strong { color: var(--primary); display: block; margin-bottom: 5px; }
        .step p { color: var(--text-muted); font-size: 0.9em; margin: 0; }

        /* --- JEUX --- */
        .section-title { text-align: center; font-size: 2em; margin: 60px 0 30px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 25px; }
        .card {
            background: var(--card-bg); border-radius: 12px; overflow: hidden;
            border: 1px solid var(--border); display: flex; flex-direction: column;
            box-shadow: var(--shadow);
        }
        .card:hover { transform: translateY(-5px); border-color: var(--primary); }
        .card img { width: 100%; height: 150px; object-fit: cover; }
        .info { padding: 20px; flex-grow: 1; display: flex; flex-direction: column; }
        .info h3 { margin: 0 0 10px; font-size: 1.1em; }
        .date { color: var(--text-muted); font-size: 0.8em; margin-bottom: auto; }
        .btn-steam { margin-top: 15px; display: block; text-align: center; background: rgba(102, 192, 244, 0.15); color: var(--primary); border: 1px solid var(--primary); }
        .btn-steam:hover { background: var(--primary); color: white; }

        /* --- FOOTER --- */
        footer { margin-top: 80px; padding: 40px; text-align: center; border-top: 1px solid var(--border); color: var(--text-muted); }
        .credits { color: var(--primary); font-weight: bold; }

        /* Mobile */
        @media (max-width: 600px) {
            .nav-items span { display: none; } /* Cache le texte du bouton navbar sur mobile */
            h1 { font-size: 2em; }
        }
    </style>
</head>
<body>

    <nav>
        <a href="#" class="logo">Free Game Deals</a>
        <div class="nav-items">
            <button class="btn btn-theme" id="theme-toggle">☀️</button>
            <a href="{{ invite_url }}" target="_blank" class="btn btn-discord">
                <img src="{{ url_for('static', filename='favicon.jpg') }}" class="btn-icon-img">
                <span>Ajouter</span>
            </a>
        </div>
    </nav>

    <div class="container">
        <header>
            <h1>Jeux Gratuits en Temps Réel</h1>
            <p class="subtitle">Le bot qui scanne Steam pour vous.</p>

            <a href="{{ invite_url }}" target="_blank" class="btn btn-discord" style="padding: 15px 30px; font-size: 1.1em;">
                <img src="{{ url_for('static', filename='favicon.jpg') }}" class="btn-icon-img" style="width: 30px; height: 30px;">
                Inviter le Bot sur mon Serveur
            </a>
        </header>

        <section class="setup-box">
            <h2>🚀 Installation Rapide</h2>
            <div class="steps">
                <div class="step">
                    <strong>1. Invitation</strong>
                    <p>Cliquez sur "Inviter" et choisissez votre serveur.</p>
                </div>
                <div class="step">
                    <strong>2. Salon</strong>
                    <p>Créez un salon textuel nommé <code>free-games</code>.</p>
                </div>
                <div class="step">
                    <strong>3. Profitez</strong>
                    <p>Le bot postera les jeux dès qu'ils sont détectés.</p>
                </div>
            </div>
        </section>

        <h2 class="section-title">🔥 Historique des trouvailles</h2>

        <div class="grid">
        {% for game in games %}
            <div class="card">
                <img src="{{ game[2] }}" alt="Cover">
                <div class="info">
                    <h3>{{ game[1] }}</h3>
                    <span class="date">📅 {{ game[4] }}</span>
                    <a href="{{ game[3] }}" target="_blank" class="btn btn-steam">Voir sur Steam</a>
                </div>
            </div>
        {% else %}
            <p style="text-align: center; width: 100%; color: var(--text-muted);">
                Scan en cours... Revenez plus tard !
            </p>
        {% endfor %}
        </div>

        <footer>
            <p>&copy; 2026 Free Game Deals Project</p>
            <p>Créé avec passion par <span class="credits">Daith_42</span> & <span class="credits">Kiliotsu</span></p>
        </footer>
    </div>

    <script>
        const toggleBtn = document.getElementById('theme-toggle');
        const html = document.documentElement;
        const savedTheme = localStorage.getItem('theme') || 'dark';
        html.setAttribute('data-theme', savedTheme);
        updateIcon(savedTheme);

        toggleBtn.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateIcon(newTheme);
        });

        function updateIcon(theme) {
            toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sent_deals ORDER BY date DESC")
        games = cursor.fetchall()
        conn.close()
        return render_template_string(HTML_TEMPLATE, games=games, invite_url=INVITE_LINK)
    except Exception as e:
        return f"Erreur : {e}"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)