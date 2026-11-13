const test = require('node:test');
const assert = require('node:assert/strict');

const { normalize_product, build_catalog_url } = require('../scrapers/gog.js');

function product(overrides = {}) {
    return {
        id: 1207659150,
        title: 'A New Beginning: Final Cut',
        slug: 'a_new_beginning',
        productType: 'game',
        storeLink: 'https://www.gog.com/en/game/a_new_beginning',
        coverHorizontal: 'https://images.gog-statics.com/test.png',
        price: {
            finalMoney: { amount: '0.00', currency: 'USD' },
            baseMoney: { amount: '9.99', currency: 'USD' },
            discount: '-100%',
        },
        ...overrides,
    };
}

test('GOG catalog URL requests temporary 100% discounts', () => {
    const url = build_catalog_url(2);

    assert.match(url, /[?&]price=between:0,0(&|$)/);
    assert.match(url, /[?&]discounted=eq:true(&|$)/);
    assert.match(url, /[?&]productType=in:game,pack(&|$)/);
    assert.match(url, /[?&]page=2(&|$)/);
});

test('normalize_product accepts a temporary 100% off game', () => {
    const deal = normalize_product(product());

    assert.ok(deal);
    assert.equal(deal.id, 'gog_1207659150');
    assert.equal(deal.store, 'GOG');
    assert.equal(deal.link, 'https://www.gog.com/en/game/a_new_beginning');
});

test('normalize_product rejects permanently free products', () => {
    const deal = normalize_product(
        product({
            price: {
                finalMoney: { amount: '0.00', currency: 'USD' },
                baseMoney: { amount: '0.00', currency: 'USD' },
                discount: null,
            },
        })
    );

    assert.equal(deal, null);
});

test('normalize_product rejects non-game products', () => {
    assert.equal(normalize_product(product({ productType: 'dlc' })), null);
});
