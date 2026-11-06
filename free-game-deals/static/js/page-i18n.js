/*
 * Free Game Deals — shared language selector and i18n for secondary pages.
 */
(function () {
    'use strict';

    const SUPPORTED_LANGS = ['en', 'fr', 'es', 'pt', 'de', 'it', 'ru'];
    const STORAGE_KEY = 'lang';
    let translations = {};
    let current_lang = 'en';

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (SUPPORTED_LANGS.includes(stored)) current_lang = stored;
    } catch (_) {
    }

    function t(key) {
        return (
            (translations[current_lang] && translations[current_lang][key]) ||
            (translations.en && translations.en[key]) ||
            key
        );
    }

    function update_dropdown() {
        const selected = document.getElementById('selected-lang-text');
        if (selected) selected.textContent = current_lang.toUpperCase();

        document.querySelectorAll('.dropdown-options li').forEach((option) => {
            option.classList.toggle(
                'active',
                option.getAttribute('data-value') === current_lang
            );
        });
    }

    function set_language(lang) {
        if (!SUPPORTED_LANGS.includes(lang)) return;
        current_lang = lang;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (_) {
        }
        apply();
    }

    function apply_deal_translations() {
        if (document.body.dataset.page !== 'deal') return;
        if (!translations[current_lang] && !translations.en) return;

        const title = document.body.dataset.dealTitle || '';
        const store = document.body.dataset.dealStore || '';
        const active = document.body.dataset.dealActive === 'true';
        const locales = {
            en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT',
            de: 'de-DE', it: 'it-IT', ru: 'ru-RU',
        };
        const locale = locales[current_lang] || 'en-US';
        const format_date = (value) => {
            if (!value) return '';
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime())
                ? value
                : parsed.toLocaleDateString(locale, {
                      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
                  });
        };
        const date = document.body.dataset.dealDateIso
            ? format_date(document.body.dataset.dealDateIso)
            : document.body.dataset.dealDate || '';
        const end_timestamp = Number(document.body.dataset.dealEndTs);
        const end = Number.isFinite(end_timestamp) && document.body.dataset.dealEndTs
            ? format_date(end_timestamp * 1000)
            : document.body.dataset.dealEnd || '';

        const headline = document.querySelector('.deal-header h1');
        if (headline) {
            const headline_text = (active ? t('dealHeadlineActive') : t('dealHeadlineEnded'))
                .replace('{title}', title)
                .replace('{store}', store);
            headline.textContent = headline_text;
            document.title = `${headline_text} | Free Game Deals`;
        }

        const subtitle = document.querySelector('.deal-header .subtitle');
        if (subtitle) {
            let text = t(active ? (end ? 'dealTrackedEnds' : 'dealTrackedActive') : 'dealTrackedEnded');
            text = text
                .replace('{date}', date)
                .replace('{end}', end);
            subtitle.textContent = text;
        }

        const description = document.querySelector('.deal-info p');
        // Keep the store description rendered by the server: the generic
        // translated sentence is only a fallback when no description exists.
        if (description && description.dataset.gameDescription !== 'true') {
            description.textContent = (active ? t('dealDescActive') : t('dealDescEnded'))
                .replace('{title}', title)
                .replace('{store}', store)
                .replace('{date}', date);
        }
    }

    function apply() {
        document.documentElement.lang = current_lang;

        document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n');
            let value = t(key);
            if (!value || value === key) return;

            const store = element.getAttribute('data-i18n-store');
            if (store) value = value.replace('{store}', store);
            element.innerHTML = value;
        });

        apply_deal_translations();
        update_dropdown();

        window.dispatchEvent(
            new CustomEvent('fgd:language', {
                detail: { lang: current_lang, t },
            })
        );
    }

    function ensure_dropdown() {
        if (document.getElementById('lang-dropdown')) return;

        const nav_inner = document.querySelector('.nav-inner');
        if (!nav_inner) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'custom-dropdown';
        dropdown.id = 'lang-dropdown';
        dropdown.innerHTML = `
            <button type="button" class="dropdown-selected" aria-haspopup="listbox" aria-label="Language">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                <span id="selected-lang-text">${current_lang.toUpperCase()}</span>
                <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <ul class="dropdown-options" role="listbox">
                <li data-value="en">English (EN)</li>
                <li data-value="fr">Français (FR)</li>
                <li data-value="es">Español (ES)</li>
                <li data-value="pt">Português (PT)</li>
                <li data-value="de">Deutsch (DE)</li>
                <li data-value="it">Italiano (IT)</li>
                <li data-value="ru">Русский (RU)</li>
            </ul>
        `;

        const nav_items = nav_inner.querySelector('.nav-items');
        nav_inner.insertBefore(dropdown, nav_items || null);

        dropdown.addEventListener('click', (event) => {
            event.stopPropagation();
            dropdown.classList.toggle('active');
        });

        dropdown.querySelectorAll('.dropdown-options li').forEach((option) => {
            option.addEventListener('click', (event) => {
                event.stopPropagation();
                set_language(option.getAttribute('data-value'));
                dropdown.classList.remove('active');
            });
        });

        document.addEventListener('click', () => dropdown.classList.remove('active'));
    }

    async function init() {
        ensure_dropdown();
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                translations = config.translations || {};
            }
        } catch (error) {
            console.error('Could not load translations:', error);
        }
        apply();
    }

    window.FGDI18n = {
        init,
        apply,
        t,
        getLang: () => current_lang,
    };

    document.addEventListener('DOMContentLoaded', init);
})();
