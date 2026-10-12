# APYS Stock Boost

UI-only React client for the APYS portfolio boost API in `../apys-internal`.

## Local development

Start the backend with its Doppler `dev_local` configuration:

```sh
cd ../apys-internal
npm run dev:doppler
```

Then start this UI in another terminal:

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/v1` to `http://localhost:3000`, keeping
the SIWS challenge and session cookies same-origin. Override the backend with
`VITE_API_PROXY_TARGET` when starting Vite.

For the production split deployment, build with
`VITE_API_URL=https://api.apys.co`. Browser requests include the API's HttpOnly
session cookie; the backend must allow the exact UI origin
`https://pools.apys.co` with credentialed CORS. Leave `VITE_API_URL` blank for
local development so requests continue through Vite's `/v1` proxy.

Fully wallet-signed boost transactions are submitted and confirmed by the
backend using its server-side `SOLANA_RPC_URL`; no RPC credential is exposed to
the browser.

## Checks

```sh
npm run check
```

The frontend never receives backend secrets, never chooses pool or program
addresses, and never submits an unsigned transaction. The backend only relays a
wallet-signed transaction that exactly matches a short-lived prepared boost.
