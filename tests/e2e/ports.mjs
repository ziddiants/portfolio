// Where the e2e server (server.mjs) serves each site. Fixed, so specs can name them.
export const PORTS = { payments: 4331, consumer: 4332, fixture: 4333 };
export const BASE = Object.fromEntries(
  Object.entries(PORTS).map(([name, port]) => [name, `http://127.0.0.1:${port}`]),
);
