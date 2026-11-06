// Run with Playwright installed. Never log the read-only access link.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const link = new URL(process.env.OVERLEAF_READ_URL || '');
  if (link.origin !== 'https://www.overleaf.com' || !/^\/read\/[a-z]+$/.test(link.pathname)) {
    throw new Error('OVERLEAF_READ_URL must be an Overleaf read-only sharing link.');
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(link.href, { waitUntil: 'domcontentloaded' });
    // Read-only access uses the fragment in the supplied sharing link.
    await page.waitForURL(/\/project\/[a-f0-9]+/, { timeout: 120000 });
    await page.getByRole('button', { name: 'Recompile', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Recompile', exact: true }).click();
    await page.getByRole('button', { name: 'Recompile', exact: true }).waitFor({ state: 'visible' });
    const pdf = page.getByRole('link', { name: 'Download PDF', exact: true });
    await page.waitForFunction(() => [...document.querySelectorAll('a')].some(a =>
      (a.getAttribute('aria-label') === 'Download PDF' || a.getAttribute('title') === 'Download PDF') && a.href.includes('output.pdf')));
    const href = await pdf.getAttribute('href');
    const response = await context.request.get(new URL(href, page.url()).href);
    if (!response.ok()) throw new Error('PDF download failed.');
    const bytes = await response.body();
    if (bytes.length < 1000 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Download is not a PDF.');
    const destination = path.resolve(process.env.RESUME_OUTPUT || 'resume-download.pdf');
    await fs.writeFile(destination, bytes);
    console.log('Downloaded compiled résumé PDF successfully.');
  } finally {
    await browser.close();
  }
}
main().catch(() => {
  console.error('Résumé sync failed. Check sharing access, compilation, and Overleaf availability. Existing résumé was not replaced.');
  process.exitCode = 1;
});
