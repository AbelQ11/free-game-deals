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
(function () {
    'use strict';

    const CONSENT_KEY = 'ads_consent';
    const ADBLOCK_KEY = 'adblock_popup_seen';
    const SLOT_KEYS = ['header', 'infeed', 'footer'];
    let ads_config = null;
    let script_loaded = false;
    let adblock_checked = false;
    let adblock_detected = false;

    function get_consent() {
        try {
            return localStorage.getItem(CONSENT_KEY);
        } catch (_) {
            return null;
        }
    }

    function set_consent(value) {
        try {
            localStorage.setItem(CONSENT_KEY, value);
        } catch (_) {
        }
    }

    function adblock_seen() {
        try {
            return sessionStorage.getItem(ADBLOCK_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function mark_adblock_seen() {
        try {
            sessionStorage.setItem(ADBLOCK_KEY, '1');
        } catch (_) {
        }
    }

    function dismiss_adblock() {
        hide_adblock_popup();
    }

    function banner_element() {
        return document.getElementById('cookie-banner');
    }

    function show_banner() {
        const banner = banner_element();
        if (banner) banner.hidden = false;
    }

    function hide_banner() {
        const banner = banner_element();
        if (banner) banner.hidden = true;
    }

    function adblock_element() {
        return document.getElementById('adblockModal');
    }

    function show_adblock_popup() {
        // Ads are only relevant once the visitor accepted them, and the popup
        // is shown at most once per browser session.
        if (get_consent() !== 'granted' || adblock_seen()) return;

        const modal = adblock_element();
        if (!modal) return;

        mark_adblock_seen();
        modal.hidden = false;
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        const button = document.getElementById('adblock-continue');
        if (button) button.focus();
    }

    function hide_adblock_popup() {
        const modal = adblock_element();
        if (!modal) return;

        modal.hidden = true;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function detect_adblock() {
        if (adblock_checked) return adblock_detected;
        adblock_checked = true;

        const bait = document.createElement('div');
        bait.className = 'adsbox ad-banner ad-placement';
        bait.setAttribute('aria-hidden', 'true');
        bait.style.cssText =
            'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;' +
            'pointer-events:none;';
        document.body.appendChild(bait);

        let blocked = false;
        try {
            const styles = window.getComputedStyle(bait);
            blocked =
                bait.offsetHeight === 0 ||
                bait.clientHeight === 0 ||
                styles.display === 'none' ||
                styles.visibility === 'hidden';
        } finally {
            bait.remove();
        }

        if (blocked) {
            adblock_detected = true;
            console.warn('Ad blocker detected.');
            show_adblock_popup();
        }

        return blocked;
    }

    function valid_client(client) {
        return typeof client === 'string' && /^ca-pub-\d{16}$/.test(client);
    }

    function valid_slot(slot) {
        return typeof slot === 'string' && /^\d{5,}$/.test(slot);
    }

    function load_script(client) {
        if (script_loaded) return;
        script_loaded = true;

        const script = document.createElement('script');
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.src =
            'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
            encodeURIComponent(client);
        script.addEventListener('error', () => {
            console.warn('AdSense script could not be loaded (blocked or offline).');
            adblock_detected = true;
            show_adblock_popup();
        });
        document.head.appendChild(script);
    }

    function create_unit(container, client, slot) {
        if (!container || container.dataset.adLoaded === 'true') return;
        container.dataset.adLoaded = 'true';
        container.classList.add('ad-active');

        const unit = document.createElement('ins');
        unit.className = 'adsbygoogle';
        unit.style.display = 'block';
        unit.setAttribute('data-ad-client', client);
        unit.setAttribute('data-ad-slot', slot);
        unit.setAttribute('data-ad-format', 'auto');
        unit.setAttribute('data-full-width-responsive', 'true');
        container.appendChild(unit);

        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
    }

    function load_ads() {
        if (!ads_config || !ads_config.enabled || !valid_client(ads_config.client)) return;
        if (!script_loaded) load_script(ads_config.client);

        const slots = ads_config.slots || {};
        for (const key of SLOT_KEYS) {
            if (valid_slot(slots[key])) {
                create_unit(document.getElementById(`ad-${key}`), ads_config.client, slots[key]);
            }
        }
    }

    function check_for_adblock() {
        // Give ad blockers a moment to apply their cosmetic filters before
        // checking the bait element.
        window.setTimeout(detect_adblock, 600);
    }

    function bind_adblock_modal() {
        const continue_button = document.getElementById('adblock-continue');
        const close_button = document.getElementById('adblock-close');
        const modal = adblock_element();

        if (continue_button) continue_button.addEventListener('click', dismiss_adblock);
        if (close_button) close_button.addEventListener('click', dismiss_adblock);

        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) dismiss_adblock();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const current = adblock_element();
                if (current && current.style.display === 'block') dismiss_adblock();
            }
        });
    }

    function init(config) {
        ads_config = config || null;
        bind_adblock_modal();

        const accept = document.getElementById('cookie-accept');
        const reject = document.getElementById('cookie-reject');
        const settings = document.getElementById('cookie-settings');

        if (accept) {
            accept.addEventListener('click', () => {
                set_consent('granted');
                hide_banner();
                load_ads();
                check_for_adblock();
            });
        }

        if (reject) {
            reject.addEventListener('click', () => {
                set_consent('denied');
                hide_banner();
                hide_adblock_popup();
                if (script_loaded) window.location.reload();
            });
        }

        if (settings) {
            settings.addEventListener('click', (event) => {
                event.preventDefault();
                if (ads_config && ads_config.enabled) show_banner();
            });
        }

        if (!ads_config || !ads_config.enabled) {
            hide_banner();
            hide_adblock_popup();
            return;
        }

        const consent = get_consent();
        if (consent === 'granted') {
            hide_banner();
            load_ads();
            check_for_adblock();
        } else if (consent === 'denied') {
            hide_banner();
        } else {
            show_banner();
        }
    }

    window.FGDAds = {
        init,
        load: load_ads,
        openConsent: show_banner,
        detectAdblock: detect_adblock,
    };
})();
