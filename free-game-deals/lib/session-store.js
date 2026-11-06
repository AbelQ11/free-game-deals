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
const session = require('express-session');

/**
 * Small SQLite-backed session store.
 *
 * express-session's default MemoryStore is not suitable for production: it
 * leaks memory and loses every session when the process restarts.
 */
class SQLiteSessionStore extends session.Store {
    constructor(db, options = {}) {
        super();
        this.db = db;
        this.ttl = options.ttl || 7 * 24 * 60 * 60 * 1000;
        this.ready = this._init();

        this.cleanup_timer = setInterval(() => this._cleanup(), 60 * 60 * 1000);
        if (this.cleanup_timer.unref) this.cleanup_timer.unref();
    }

    _init() {
        return new Promise((resolve, reject) => {
            this.db.run(
                'CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL)',
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    _expires(sess) {
        const expires = sess && sess.cookie ? sess.cookie.expires : null;
        const timestamp = expires ? new Date(expires).getTime() : Date.now() + this.ttl;
        return Number.isFinite(timestamp) ? timestamp : Date.now() + this.ttl;
    }

    get(sid, callback) {
        this.ready
            .then(() => {
                this.db.get(
                    'SELECT sess FROM sessions WHERE sid = ? AND expires > ?',
                    [sid, Date.now()],
                    (err, row) => {
                        if (err) return callback(err);
                        if (!row) return callback(null, null);
                        try {
                            callback(null, JSON.parse(row.sess));
                        } catch (_) {
                            this.db.run('DELETE FROM sessions WHERE sid = ?', [sid], () => {});
                            callback(null, null);
                        }
                    }
                );
            })
            .catch(callback);
    }

    set(sid, sess, callback) {
        this.ready
            .then(() => {
                this.db.run(
                    `INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
                     ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`,
                    [sid, JSON.stringify(sess), this._expires(sess)],
                    (err) => callback(err || null)
                );
            })
            .catch(callback);
    }

    destroy(sid, callback) {
        this.ready
            .then(() => {
                this.db.run('DELETE FROM sessions WHERE sid = ?', [sid], (err) => callback(err || null));
            })
            .catch(callback);
    }

    touch(sid, sess, callback) {
        this.ready
            .then(() => {
                this.db.run(
                    'UPDATE sessions SET expires = ? WHERE sid = ?',
                    [this._expires(sess), sid],
                    (err) => callback(err || null)
                );
            })
            .catch(callback);
    }

    _cleanup() {
        this.ready
            .then(() => {
                this.db.run('DELETE FROM sessions WHERE expires <= ?', [Date.now()], () => {});
            })
            .catch(() => {});
    }
}

module.exports = SQLiteSessionStore;
