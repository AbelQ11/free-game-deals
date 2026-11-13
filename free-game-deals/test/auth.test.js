const test = require('node:test');
const assert = require('node:assert/strict');

const { can_manage_guild, manageable_guilds } = require('../routes/auth');

test('can_manage_guild accepts Manage Server and Administrator', () => {
    assert.equal(can_manage_guild(0x20), true);
    assert.equal(can_manage_guild(0x8), true);
    assert.equal(can_manage_guild(String(0x20 | 0x400)), true);
    assert.equal(can_manage_guild(0x400), false);
    assert.equal(can_manage_guild(undefined), false);
});

test('manageable_guilds keeps only servers the user can manage', () => {
    const guilds = manageable_guilds({
        guilds: [
            { id: '1', name: 'Manageable', icon: null, permissions: 0x20, owner: false },
            { id: '2', name: 'Admin', icon: 'abc', permissions: 0x8, owner: true },
            { id: '3', name: 'Not manageable', icon: null, permissions: 0x400, owner: false },
        ],
    });

    assert.deepEqual(
        guilds.map((guild) => guild.id),
        ['1', '2']
    );
    assert.equal(guilds[1].owner, true);
    assert.equal(guilds[1].icon, 'abc');
});

test('manageable_guilds tolerates a missing guild list', () => {
    assert.deepEqual(manageable_guilds({}), []);
});
