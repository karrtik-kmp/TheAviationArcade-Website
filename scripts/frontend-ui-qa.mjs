import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5173';
const output = 'outputs/frontend-ui-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
const page = await context.newPage();
const checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.type() === 'error')
    errors.push(message.text()); });
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name); }
async function visit(route) { const r = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 }); assert.equal(r.status(), 200, route); await page.locator('h1').waitFor(); await page.evaluate(() => document.fonts.ready); if (route === '/sign-in')
    await page.waitForFunction(() => { const input = document.querySelector('input[name=email]'); return input && !input.disabled; }, { timeout: 30000 }); await page.locator('a.account-signin, .account-trigger, .account-error, .auth-mode-links').first().waitFor({ timeout: 30000 }).catch(() => { }); }
function contrast(a, b) { const lum = s => s.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0); const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
try {
    for (const theme of ['light', 'dark']) {
        await visit('/');
        if (theme === 'dark')
            await page.getByRole('button', { name: 'Use dark theme' }).click();
        for (const width of [320, 768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            for (const route of ['/', '/games', '/sign-in', '/contribute', '/plane-of-the-day', '/get-the-app', '/privacy']) {
                await check(`${theme} ${width}px ${route}: layout and content`, async () => {
                    await visit(route);
                    assert.equal(await page.locator('h1').count(), 1);
                    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
                    assert.ok(dimensions.content <= dimensions.viewport + 1, JSON.stringify({ route, width, ...dimensions }));
                    assert.equal(await page.getByText(/ChatGPT sign-in/i).count(), 0);
                    const skip = page.getByRole('link', { name: 'Skip to content' });
                    if (await skip.count())
                        assert.equal(await page.locator('#main').count(), 1, 'Skip target missing');
                    if ((route === '/' || route === '/sign-in') && (width === 320 || width === 1440))
                        await page.screenshot({ path: `${output}/${route === '/' ? 'home' : 'sign-in'}-${theme}-${width}.png`, fullPage: true });
                });
            }
        }
        await visit('/');
        await page.setViewportSize({ width: 1440, height: 1000 });
        const cta = page.locator('.hero .btn').first();
        await check(`${theme} primary button contrast, rest and hover`, async () => { for (const hover of [false, true]) {
            if (hover)
                await cta.hover();
            else
                await page.mouse.move(0, 0);
            await page.waitForTimeout(250);
            const c = await cta.evaluate(e => ({ fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, filter: getComputedStyle(e).filter }));
            assert.equal(c.filter, 'none');
            assert.ok(contrast(c.fg, c.bg) >= 4.5, JSON.stringify(c));
        } });
    }
    await check('Catalog filters, empty state and reset', async () => { await visit('/games'); await page.getByRole('button', { name: 'Matching', exact: true }).click(); assert.equal(await page.locator('.game-card').count(), 2); await page.getByRole('textbox', { name: 'Search games' }).fill('zzzz'); await page.getByRole('heading', { name: 'No matching games' }).waitFor(); await page.getByRole('button', { name: 'Clear filters' }).click(); assert.equal(await page.locator('.game-card').count(), 8); });
    await check('Keyboard form-mode transitions focus the new heading', async () => { await visit('/sign-in'); for (const name of ['Create an account', 'Already have an account? Sign in', 'Forgot password?', 'Back to sign in']) {
        const button = page.getByRole('button', { name, exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
        assert.equal(await page.locator('h1').evaluate(e => e === document.activeElement), true);
    } });
    await check('Photographer skip link moves keyboard navigation into content', async () => { await visit('/contribute'); await page.getByRole('link', { name: 'Skip to content' }).focus(); await page.keyboard.press('Enter'); assert.equal(new URL(page.url()).hash, '#main'); await page.keyboard.press('Tab'); assert.equal(await page.locator('#main').evaluate(e => e.contains(document.activeElement) || !!(e.compareDocumentPosition(document.activeElement) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'Tab after the skip link must land in or after the content, never back in the header'); });
    await check('Mobile navigation opens, follows links and closes with Escape', async () => { await page.setViewportSize({ width: 390, height: 844 }); await visit('/'); const menu = page.getByRole('button', { name: 'Open menu', exact: true }); await menu.click(); assert.equal(await page.getByRole('button', { name: 'Close menu', exact: true }).getAttribute('aria-expanded'), 'true'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Open menu', exact: true }).click(); await page.locator('#mobile-nav').getByRole('link', { name: 'App release details' }).click(); await page.getByRole('heading', { name: 'Your next Trip is on the horizon.' }).waitFor(); assert.equal(await page.getByText('Get the App', { exact: true }).count(), 0); });
    await check('Public browsing needs no authentication gate', async () => { await visit('/privacy'); assert.ok((await page.locator('main').innerText()).includes('You can browse this website without signing in.')); assert.equal(await context.cookies().then(c => c.filter(x => x.name === '__sites_local_auth').length), 0); });
    await check('Mobile touch navigation, registration and no legacy hosting gate', async () => { const mobile = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'light' }); try {
        const phone = await mobile.newPage();
        await phone.goto(origin);
            await phone.getByRole("link", { name: "Sign in", exact: true }).waitFor();
        await phone.getByRole('button', { name: 'Open menu', exact: true }).tap();
        await phone.locator('#mobile-nav').getByRole('link', { name: 'App release details' }).tap();
        await phone.getByRole('heading', { name: 'Your next Trip is on the horizon.' }).waitFor();
        await phone.goto(origin + '/sign-in');
        await phone.waitForFunction(() => { const input = document.querySelector('input[name=email]'); return input && !input.disabled; });
        assert.equal(await phone.locator('.community-signin-photo').isVisible(), false);
        await phone.getByRole('button', { name: 'Create an account', exact: true }).tap();
        await phone.waitForFunction(() => document.activeElement?.tagName === 'H1');
        assert.equal(await phone.locator('h1').innerText(), 'Create your account');
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await phone.screenshot({ path: output + '/iphone-registration.png', fullPage: true });
        assert.equal((await mobile.request.get(origin + '/signin-with-chatgpt')).status(), 404);
    }
    finally {
        await mobile.close();
    } });
    assert.deepEqual(errors, [], 'Browser exceptions and console errors');
}
finally {
    await writeFile(output + '/results.json', JSON.stringify({ origin, checks, errors }, null, 2));
    await browser.close();
    console.log(`${checks.length} checks completed; ${errors.length} browser errors`);
}
