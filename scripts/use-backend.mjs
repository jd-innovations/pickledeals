// Points the mobile app at the local Supabase stack, either on this PC only or over the Wi-Fi so a
// phone with a development build can reach it (docs/DEVICE_SETUP.md, option a).
//
//   npm run device:lan      # EXPO_PUBLIC_SUPABASE_URL=http://<this PC's Wi-Fi IP>:54321
//   npm run device:local    # EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (web preview)
//
// Only the URL line in apps/mobile/.env.local changes; the anon key is kept. Restart `npx expo start`
// afterwards (EXPO_PUBLIC_* values are read when Metro bundles).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile', '.env.local');
const PORT = 54321;
const mode = process.argv[2];

function lanAddress() {
  const virtual = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|Bluetooth|Tailscale|ZeroTier/i;
  const candidates = Object.entries(networkInterfaces())
    .filter(([name]) => !virtual.test(name))
    .flatMap(([name, addrs]) => (addrs ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })))
    .filter((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address));
  // Prefer Wi-Fi, then Ethernet, then anything private.
  return candidates.find((c) => /wi-?fi|wlan|wireless/i.test(c.name)) ?? candidates.find((c) => /ethernet|^en/i.test(c.name)) ?? candidates[0];
}

if (mode !== 'lan' && mode !== 'local') {
  console.error('Usage: node scripts/use-backend.mjs lan|local');
  process.exit(1);
}
if (!existsSync(ENV)) {
  console.error(`Missing ${ENV}. Copy apps/mobile/.env.example and fill in the anon key from \`npx supabase status\`.`);
  process.exit(1);
}

let host = '127.0.0.1';
if (mode === 'lan') {
  const lan = lanAddress();
  if (!lan) {
    console.error('No private Wi-Fi/Ethernet IPv4 address found. Is this PC on the same network as the phone?');
    process.exit(1);
  }
  host = lan.address;
  console.log(`Using ${lan.name} (${host}).`);
}

const url = `http://${host}:${PORT}`;
const lines = readFileSync(ENV, 'utf8').split(/\r?\n/);
const i = lines.findIndex((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_URL='));
if (i >= 0) lines[i] = `EXPO_PUBLIC_SUPABASE_URL=${url}`;
else lines.push(`EXPO_PUBLIC_SUPABASE_URL=${url}`);
writeFileSync(ENV, lines.join('\n'));
console.log(`apps/mobile/.env.local → EXPO_PUBLIC_SUPABASE_URL=${url}`);
if (mode === 'lan') {
  console.log(`Phone check: open ${url}/rest/v1/ in Safari on the iPhone; a JSON error (not a timeout) means it can reach this PC.`);
  console.log('Then restart Metro: npx expo start --dev-client (from apps/mobile)');
}
