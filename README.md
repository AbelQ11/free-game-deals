# free-game-deals

Free-game-deals est un écosystème automatisé conçu pour détecter les jeux payants devenant temporairement gratuits sur Steam. Le projet combine un bot de surveillance en temps réel et une interface web moderne pour suivre l'historique des offres.

Caractéristiques
Scan en Temps Réel : Surveillance directe des pages de recherche Steam (Scraping) pour détecter les remises de -100% ou les prix à 0,00€.

Notifications Discord Multi-Serveurs : Alerte automatiquement tous les serveurs possédant le bot dans un salon dédié nommé #free-games.

Tableau de Bord Web : Interface élégante développée avec Flask pour visualiser l'historique des trouvailles.

Design Moderne : Support du Mode Sombre / Clair et interface entièrement Responsive (mobile-friendly).

Sécurisé : Déploiement via Nginx en Reverse Proxy avec cryptage HTTPS (SSL) via Certbot.

Technologies Utilisées
Langage : Python 3.10+

Bot Discord : discord.py

Serveur Web : Flask, Nginx

Scraping : BeautifulSoup4, Requests

Base de Données : SQLite3

Infrastructure : Oracle Cloud (Ubuntu VM)

DNS & SSL : DuckDNS & Let's Encrypt (Certbot)


Structure des fichiers
free_game_bot_pro.py : Le cerveau du bot (Scans + Events Discord).

website.py : Le serveur Flask pour le site web.

static/favicon.jpg : L'icône personnalisée du bot.

deals_memory.db : La base de données SQLite générée automatiquement.


Inviter le Bot : Utiliser le bouton d'invitation présent sur le site web.

Configurer le salon : Créer un salon textuel nommé exactement free-games.

Réception : Dès qu'un jeu est détecté comme gratuit (ex: Along the Edge), le bot poste une fiche détaillée avec le lien Steam.

Configuration Réseau & SSL
Le projet utilise un nom de domaine DuckDNS lié à l'IP publique de la VM Oracle Cloud.
La sécurité est assurée par une règle de redirection HTTP vers HTTPS générée par Certbot :

Crédits
- Daith_42
- Kiliotsu
