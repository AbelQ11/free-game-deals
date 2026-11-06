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
const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(__dirname, '..', 'lang');
const lang_data = {};

for (const file of fs.readdirSync(LANG_DIR).sort()) {
    if (!file.endsWith('.json')) continue;

    const code = path.basename(file, '.json');
    const file_path = path.join(LANG_DIR, file);
    lang_data[code] = JSON.parse(fs.readFileSync(file_path, 'utf8'));
}

module.exports = lang_data;
