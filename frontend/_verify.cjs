const puppeteer = require('puppeteer-core');

(async () => {
  // Launch a fresh headless Chrome instance (separate from the user's browser)
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));

  const data = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.innerText || 'NO H1',
    bodyLen: document.body.innerText.length,
    rootChildren: document.getElementById('root')?.children.length || 0,
    sample: document.body.innerText.slice(0, 600),
    buttons: [...document.querySelectorAll('button')].map((b) => b.innerText).slice(0, 12),
  }));

  await page.screenshot({ path: '/tmp/smartpay-home.png' });

  console.log(JSON.stringify({ ...data, jsErrors: errors }, null, 2));

  await browser.close();
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
