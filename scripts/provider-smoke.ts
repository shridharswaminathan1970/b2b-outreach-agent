// Provider smoke test: confirms each configured key (Anthropic / Resend / Apollo
// / HubSpot) is valid via a minimal live API call, and that the live/mock toggle
// resolves correctly given the key + USE_MOCK_* flags. Never prints secrets.
//
//   Run from the repo root:  npx tsx scripts/provider-smoke.ts
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

// Load the monorepo-root .env exactly like the app (apps/api/src/config).
(function loadEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config();
})();

function mask(v: string | undefined): string {
  const s = (v ?? '').trim();
  if (!s) return '(unset)';
  return s.length > 8 ? `${s.slice(0, 3)}…${s.slice(-3)} (len ${s.length})` : '(set)';
}

async function timed(fn: () => Promise<Response>): Promise<{ ok: boolean; status: number | string; detail?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fn();
    let detail = '';
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      detail = body.slice(0, 160);
    }
    return { ok: res.ok, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 'ERR', detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  // Dynamic-import config AFTER dotenv so module-level env reads are populated.
  const { isLiveMode, aiConfig } = await import('@outreach/ai');
  const { emailIsLive, enrichmentIsLive, crmIsLive, integrationsConfig } = await import(
    '@outreach/integrations'
  );

  const anthropicKey = aiConfig.apiKey.trim();
  const resendKey = integrationsConfig.email.resendApiKey;
  const apolloKey = integrationsConfig.enrichment.apolloApiKey;
  const apolloBase = integrationsConfig.enrichment.apolloBaseUrl;
  const hubspotKey = integrationsConfig.crm.hubspotToken;

  console.log('\n=== Provider smoke test ===\n');
  console.log('Mock-flag env values:');
  console.log('  USE_MOCK_EMAIL     =', process.env.USE_MOCK_EMAIL ?? '(unset)');
  console.log('  USE_MOCK_ENRICHMENT=', process.env.USE_MOCK_ENRICHMENT ?? '(unset)');
  console.log('  USE_MOCK_CRM       =', process.env.USE_MOCK_CRM ?? '(unset)');

  const rows: Array<Record<string, string>> = [];

  // ── Anthropic ──
  {
    const live = isLiveMode();
    let check = 'skipped (mock)';
    if (anthropicKey) {
      const r = await timed(() =>
        fetch('https://api.anthropic.com/v1/models?limit=1', {
          headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        }),
      );
      check = r.ok ? `VALID (${r.status})` : `INVALID (${r.status}) ${r.detail ?? ''}`;
    }
    rows.push({ provider: 'Anthropic', key: mask(anthropicKey), toggle: live ? 'LIVE' : 'mock', check });
  }

  // ── Resend ──
  {
    const live = emailIsLive();
    let check = 'skipped (mock)';
    if (resendKey) {
      const r = await timed(() =>
        fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${resendKey}` } }),
      );
      check = r.ok ? `VALID (${r.status})` : `INVALID (${r.status}) ${r.detail ?? ''}`;
    }
    rows.push({ provider: 'Resend', key: mask(resendKey), toggle: live ? 'LIVE' : 'mock', check });
  }

  // ── Apollo ──
  {
    const live = enrichmentIsLive();
    let check = 'skipped (mock)';
    if (apolloKey) {
      const r = await timed(() =>
        fetch(`${apolloBase}/mixed_people/api_search?per_page=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
        }),
      );
      check = r.ok ? `VALID (${r.status})` : `INVALID (${r.status}) ${r.detail ?? ''}`;
    }
    rows.push({ provider: 'Apollo', key: mask(apolloKey), toggle: live ? 'LIVE' : 'mock', check });
  }

  // ── HubSpot (expected: no key → mock; no live call) ──
  {
    const live = crmIsLive();
    rows.push({
      provider: 'HubSpot',
      key: mask(hubspotKey),
      toggle: live ? 'LIVE' : 'mock',
      check: hubspotKey ? 'present' : 'no key — mock (expected)',
    });
  }

  console.log('\nResults:');
  for (const r of rows) {
    console.log(
      `  ${r.provider.padEnd(10)} key=${r.key.padEnd(22)} toggle=${r.toggle.padEnd(5)} ${r.check}`,
    );
  }

  // ── Toggle assertions. A usable key (with USE_MOCK!=true) must resolve LIVE;
  //    an absent OR malformed key must resolve mock. Anthropic additionally
  //    requires the sk-ant- format (its live guard), so a malformed key that
  //    correctly stays on mock is a PASS, not a failure. ──
  console.log('\nToggle correctness:');
  const assertToggle = (name: string, expectLive: boolean, live: boolean, note = '') => {
    const ok = live === expectLive;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: expected ${expectLive ? 'live' : 'mock'} → got ${live ? 'live' : 'mock'} ${note}`);
    return ok;
  };
  const anthropicUsable = anthropicKey.startsWith('sk-ant-');
  const allPass =
    assertToggle('Anthropic', anthropicUsable, isLiveMode(), anthropicUsable ? '' : '(key malformed → mock is correct)') &&
    assertToggle('Resend', Boolean(resendKey), emailIsLive()) &&
    assertToggle('Apollo', Boolean(apolloKey), enrichmentIsLive()) &&
    assertToggle('HubSpot', Boolean(hubspotKey), crmIsLive());

  console.log(`\nToggle logic: ${allPass ? 'all correct' : 'MISMATCH — investigate'}\n`);
}

main().catch((e) => {
  console.error('smoke test crashed:', e);
  process.exit(1);
});
