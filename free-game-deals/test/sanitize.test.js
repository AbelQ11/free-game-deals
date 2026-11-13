const test = require('node:test');
const assert = require('node:assert/strict');

const {
    clean_description,
    clean_text,
    safe_link,
    safe_image,
    infer_store,
} = require('../lib/sanitize');

test('clean_description strips tags, scripts and entities', () => {
    const value = clean_description(
        '<script>alert("x")</script><style>.x{}</style><p>Hello &amp; welcome</p>'
    );

    assert.equal(value, 'Hello & welcome');
});

test('clean_description trims to the requested length', () => {
    assert.equal(clean_description('abcdef', 5), 'abcde');
});

test('clean_text collapses whitespace and control characters', () => {
    assert.equal(clean_text('  hello\n\tworld  '), 'hello world');
});

test('safe_link only accepts allowed https stores', () => {
    assert.equal(
        safe_link('https://store.steampowered.com/app/1'),
        'https://store.steampowered.com/app/1'
    );
    assert.equal(safe_link('http://store.steampowered.com/app/1'), null);
    assert.equal(safe_link('https://evil.example/app/1'), null);
});

test('safe_image only accepts allowed https image hosts', () => {
    assert.equal(
        safe_image('https://images.gog-statics.com/test.png'),
        'https://images.gog-statics.com/test.png'
    );
    assert.equal(safe_image('https://evil.example/test.png'), null);
});

test('infer_store detects Epic, GOG and defaults to Steam', () => {
    assert.equal(infer_store('https://store.epicgames.com/p/test'), 'Epic Games');
    assert.equal(infer_store('https://www.gog.com/en/game/test'), 'GOG');
    assert.equal(infer_store('https://store.steampowered.com/app/1'), 'Steam');
});
