const test = require('node:test');
const assert = require('node:assert/strict');

const { deal_is_active, clamp_text, escape_html, escape_xml } = require('../lib/render');

test('deal_is_active handles missing, future and past end dates', () => {
    assert.equal(deal_is_active({ end_date: null }), true);
    assert.equal(deal_is_active({ end_date: 'null' }), true);
    assert.equal(
        deal_is_active({ end_date: String(Math.floor(Date.now() / 1000) + 3600) }),
        true
    );
    assert.equal(
        deal_is_active({ end_date: String(Math.floor(Date.now() / 1000) - 3600) }),
        false
    );
});

test('clamp_text shortens with an ellipsis', () => {
    assert.equal(clamp_text('abcdef', 5), 'abcd…');
    assert.equal(clamp_text('abc', 5), 'abc');
});

test('escape_html escapes dangerous characters', () => {
    assert.equal(escape_html('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('escape_xml escapes apostrophes for feeds', () => {
    assert.equal(escape_xml("Tom & Jerry's <game>"), 'Tom &amp; Jerry&apos;s &lt;game&gt;');
});
