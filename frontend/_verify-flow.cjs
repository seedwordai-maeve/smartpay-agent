const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const errors = [];
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('CONSOLE.ERROR: ' + msg.text());
  });

  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));

  // Step 1: Click "Clean text invoice" sample button
  const sampleBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Clean text invoice'))
  );
  await sampleBtn.click();
  await new Promise((r) => setTimeout(r, 400));

  // Step 2: Verify textarea populated, then click "Submit to agent"
  const textareaVal = await page.$eval('textarea', (t) => t.value.slice(0, 80));
  console.log('1. Textarea populated:', textareaVal.length > 20);

  const submitBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Submit to agent'))
  );
  await submitBtn.click();
  console.log('2. Clicked submit');

  await new Promise((r) => setTimeout(r, 2200));

  // Step 3: Check review phase (use textContent, case-insensitive — CSS uppercase transforms innerText)
  const reviewData = await page.evaluate(() => {
    const text = document.body.textContent || '';
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent || '');
    const approveBtn = btns.find((t) => /approve/i.test(t));
    return {
      hasReviewHeading: /review.{0,5}approve/i.test(text),
      hasAcme: text.includes('Acme'),
      hasApproveBtn: !!approveBtn,
      approveBtnText: approveBtn,
      amountInButton: (approveBtn || '').match(/([\d,.]+)\s*RLUSD/)?.[1],
      hasWallet: text.includes('rD8sEimQjrmzqXryQYsbqzLGw3Y9X3yF1Y') ||
        !!document.querySelector('input[value*="rD8sEimQjrmz"]'),
      hasConfidence: /AI confidence/i.test(text),
    };
  });
  console.log('3. Review phase:', reviewData);

  await page.screenshot({ path: '/tmp/smartpay-review.png', fullPage: false });

  // Step 4: Click approve
  const approveBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => /approve/i.test(b.textContent || ''))
  );
  await approveBtn.click();
  console.log('4. Clicked approve');

  await new Promise((r) => setTimeout(r, 5000));

  const settleData = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      isSettled: /settlement confirmed/i.test(text),
      hasTxHashLabel: /transaction hash/i.test(text),
      hasTxHashValue: /[0-9A-Fa-f]{40,}/.test(text),
      hasExplorerLink: [...document.querySelectorAll('a')].some((a) =>
        a.href.includes('testnet.xrpl.org')
      ),
      hasTimeline: /AI extraction|invoice submitted/i.test(text),
      hasLedger: /ledger/i.test(text),
      hasFee: /network fee|XRP/i.test(text),
    };
  });
  console.log('5. Settlement result:', settleData);

  await page.screenshot({ path: '/tmp/smartpay-settled.png', fullPage: false });

  // Step 6: Check audit log section loaded
  const auditData = await page.evaluate(() => {
    const text = document.body.textContent || '';
    return {
      hasAuditHeading: /recent settlements/i.test(text),
      hasVendorRows: ['Acme Suppliers', 'Globex', 'Cyberdyne'].some((v) => text.includes(v)),
    };
  });
  console.log('6. Audit log:', auditData);

  console.log('7. JS errors:', errors.length ? errors : 'none');
  await browser.close();

  // Aggregate pass/fail
  const checks = [
    ['textarea populated', textareaVal.length > 20],
    ['review heading', reviewData.hasReviewHeading],
    ['acme vendor', reviewData.hasAcme],
    ['approve button', reviewData.hasApproveBtn],
    ['amount in button', !!reviewData.amountInButton],
    ['wallet visible', reviewData.hasWallet],
    ['confidence shown', reviewData.hasConfidence],
    ['settled', settleData.isSettled],
    ['tx hash label', settleData.hasTxHashLabel],
    ['tx hash value', settleData.hasTxHashValue],
    ['explorer link', settleData.hasExplorerLink],
    ['timeline', settleData.hasTimeline],
    ['audit heading', auditData.hasAuditHeading],
    ['audit rows', auditData.hasVendorRows],
    ['no JS errors', errors.length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  console.log('\n=== RESULT ===');
  console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECKS FAILED:`);
  failed.forEach(([name]) => console.log('  FAIL:', name));
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
