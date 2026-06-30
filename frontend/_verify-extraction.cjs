// Test extraction across all 3 sample invoices
const puppeteer = require('puppeteer-core');

const SAMPLES = [
  { idx: 0, name: 'Clean text invoice', expect: { amount: '1250.00', currency: 'RLUSD', vendor: /acme/i } },
  { idx: 1, name: 'Short payment instruction', expect: { amount: '85.00', currency: 'RLUSD', vendor: /globex/i } },
  { idx: 2, name: 'Multi-line vendor invoice', expect: { amount: '5400.00', currency: 'RLUSD', vendor: /cyberdyne/i } },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const results = [];
  for (const s of SAMPLES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });

    // Click sample button by index
    await page.evaluate((i) => {
      const btns = [...document.querySelectorAll('button')].filter((b) =>
        /clean text|short payment|multi-line/i.test(b.innerText)
      );
      btns[i].click();
    }, s.idx);
    await new Promise((r) => setTimeout(r, 400));

    // Submit
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) =>
        b.innerText.includes('Submit to agent')
      )?.click();
    });
    await new Promise((r) => setTimeout(r, 2200));

    const data = await page.evaluate(() => {
      const text = document.body.textContent || '';
      const approveBtn = [...document.querySelectorAll('button')].find((b) =>
        /approve/i.test(b.textContent || '')
      );
      const amount = (approveBtn?.textContent || '').match(/([\d,.]+)\s*(RLUSD|XRP)/);
      const walletInput = document.querySelector('input[value^="r"]');
      return {
        approveBtnText: approveBtn?.textContent?.trim(),
        amount: amount?.[1],
        currency: amount?.[2],
        hasVendor: text,
        wallet: walletInput?.value,
        errors: [],
      };
    });
    data.errors = errors;

    const pass =
      data.amount === s.expect.amount &&
      data.currency === s.expect.currency &&
      s.expect.vendor.test(data.hasVendor);

    results.push({ sample: s.name, ...data, pass });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${s.name}: amount=${data.amount} ${data.currency}, errors=${errors.length}`);
    await page.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log('\n=== EXTRACTION RESULT ===');
  console.log(failed.length === 0 ? 'ALL SAMPLES PASSED' : `${failed.length} FAILED`);
  failed.forEach((r) => console.log('  FAIL:', r.sample, JSON.stringify({ amount: r.amount, currency: r.currency })));
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
