# Decentralized DERMS Prototype

Pod listener and Dashboard GUI that can read and display data contained in Solid Pods

“Login to Solid” sends you to the Solid server at the VITE_BASE_URI in  `.env` file to authenticate (enter credentials / pick account) via logging into the Solid OIDC (OpenID Connect) identity provider (issuer), then redirects back with tokens so the app can read/write pod resources on that server.

Edit the `.env` file to set resource to watch/overwrite by providing the Solid Community Server URL (Be sure not to inlude the ending '/' on, for example, your Amazon EC2 instance.)

You might have to click the advanced settings to have your browser accept the CSS before you can login for now

Login to the webportal as a utility using the credentials of:
util@example.com
password123

## Notes:
If you get: error when starting dev server: Error: EPERM: operation not permitted
Remove-Item -Recurse -Force "C:\Users\putte\GitHub\Solid-Pod-Writer\node_modules\.vite"
Then run: npm install

If clicking "Login to Solid" yields the following in the Inspect Console: 
Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID
IssuerConfigFetcher.ts:174   Uncaught (in promise) TypeError: Failed to fetch
    at _IssuerConfigFetcher.fetchConfig (IssuerConfigFetcher.ts:174:43)
    at OidcLoginHandler.handle (OidcLoginHandler.ts:97:38)
    at ClientAuthentication2.login (ClientAuthentication.ts:72:29)
    at async Session.login (Session.ts:204:5)
    at async loginToSolid

Go to the source URI of your Solid Server in your browser that says:
"Your connection isn't private"
and click advanced to continue to the unsafe site, then the connection will work.

## Setup

1. `npm install`
2. `npm run dev` to run

## DER pods and discovery

New device pods must be listed in **`solid_devices.json`** (credentials and WebIDs) and in **`src/config/derWebIds.ts`** as **`DER_POD_WEBIDS`** with the same folder names and expected `webId` values. Do not put passwords in the client bundle; `derWebIds.ts` is WebIDs only. Until a pod name exists in that map, it will not appear in the discovered-pods list merged from the server.

## Debugger (Pod file viewer)

The app includes a built-in debugger panel (rendered by `src/functions/parsers/DebugReader.tsx`) that helps you see what the reader is discovering and fetching from each selected Pod.

Features:
- **Multi-pod support**: shows results grouped by Pod when multiple pods are selected.
- **Lazy loading (prevents OOM)**: it **lists file URLs first**, then fetches file content **only when you expand** an individual row. This avoids downloading/storing every file from every pod at once.
- **Quick parse summary**: for loaded files, it shows a compact parsed-point summary (counts by type + basic DNP3 metadata) before the raw file text.
- **File size guard**: large files are blocked from loading in the debugger to prevent the page from running out of memory.
  - The current limit is passed here: `src/functions/parsers/DebugReader.tsx` → `fetchTextFile(..., { maxBytes: 2_000_000 })`
  - The guard is enforced here: `src/functions/services/dataService.ts` → `fetchTextFile()` throws `File too large (...)` when the Blob exceeds `maxBytes`
  - Increase `maxBytes` in `DebugReader.tsx` if you want to view bigger `.ttl` files in the debugger.
- **Permission visibility**: if a resource returns `403 Forbidden`, the row shows the error message (typical when utility lacks read rights on that specific resource).

## DNP3 data size

Large Turtle files can contain many RDF subjects and history arrays. The DNP3 parser skips **Python-style boolean-only** value arrays (e.g. `[True, False, …]`), omits configured **non-numeric field names** (see `src/functions/config/dnp3GraphPolicy.ts`), keeps only the **newest samples** per subject, caps points **per field series**, and charts use a **bounded** number of points so the browser does not run out of memory.

By default:
- **Per-subject history**: only the latest ~`MAX_DNP3_SAMPLES_PER_SUBJECT` samples from a single RDF subject are kept.
- **Per-series cap**: only the latest ~`MAX_DNP3_POINTS_PER_SERIES` points per logical DNP3 series (field + device + group + register) are retained in memory.
- **Per-chart cap**: each rendered chart draws at most ~600 points, even if more are loaded.

You can tune these limits in `src/functions/config/dnp3GraphPolicy.ts` (for parsing/state) and `src/functions/utils/chartUtils.tsx` (for chart rendering) if you need more or less history.
