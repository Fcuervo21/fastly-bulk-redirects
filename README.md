# Fastly Bulk Redirects

## The Problem

Domain migrations, path rebrands, and content sunsetting all produce the same artifact: a growing table of source-to-destination URL mappings. Most teams handle this at the origin — an nginx `map` block, application middleware, or a database lookup — forcing every redirect to travel all the way back to the origin server just to return a `Location` header. Each redirect adds latency for the visitor and burns compute on infrastructure that could be doing real work.

## The Fastly Solution

This project moves the entire **bulk redirect table** (**Config Store**) to the Fastly edge. A lightweight **edge worker** (**Compute** service) intercepts each request at the nearest POP, performs a synchronous lookup against the **edge dictionary** (**Config Store**), and returns a `301` or `302` redirect — no origin server involved.

Because the **Config Store** is a globally distributed key-value store that lives in-memory at every Fastly POP, lookups are synchronous and do not require a network hop to a storage backend. Redirect entries can be added, updated, or removed through the Fastly CLI without redeploying the **Compute** service — changes propagate globally in approximately 30 seconds.

## The Educational Twist: A Visual `/success` Page

Traditional redirect demos silently bounce users to an external URL, making it impossible to _see_ that the edge did anything. This demo takes a different approach.

Instead of redirecting to external sites, every path in the **redirect table** (**Config Store**) points to a `/success` interception page hosted on the same **Compute** service. When a visitor clicks `/promo`, the **edge worker** (**Compute**) looks up the path, finds a `302` entry, and redirects the browser to `/success?from=/promo&to=https://www.fastly.com`. The `/success` handler — also running at the edge with zero origin involvement — dynamically generates an HTML page that:

- Confirms the redirect happened and displays the source path the visitor clicked.
- Shows the real-world destination they _would_ have reached in production.
- Renders a visual flow diagram: **source path** &rarr; **edge lookup** &rarr; **/success**.
- Offers a button to continue to the actual destination, and another to return to the demo landing page.

The entire round-trip — lookup, redirect, and success page generation — completes at the edge with no origin latency.

## Architecture

```
                           ┌─────────────────────────────┐
  Client GET /promo ─────▶ │      Fastly Edge POP        │
                           │                             │
                           │  ┌───────────────────────┐  │
                           │  │  Compute service       │  │
                           │  │  (edge worker / JS)    │  │
                           │  └──────────┬────────────┘  │
                           │             │               │
                           │  ┌──────────▼────────────┐  │
                           │  │  Config Store          │  │
                           │  │  (bulk redirect table) │  │
                           │  └──────────┬────────────┘  │
                           │             │               │
                           │       match found?          │
                           │       ┌─yes──┴──no─┐        │
                           │       ▼            ▼        │
                           │   302 Location    404       │
                           │   → /success                │
                           └─────────────────────────────┘
                                      │
                           ┌──────────▼──────────────────┐
                           │  /success page (same POP)   │
                           │  Dynamically generated HTML  │
                           │  showing redirect details    │
                           └─────────────────────────────┘
```

**Step by step:**

1. A request arrives at the nearest Fastly POP.
2. The **Compute service** (**edge worker**) reads the incoming path.
3. It performs a synchronous lookup against the **Config Store** (**edge dictionary** / **bulk redirect table**).
4. **Match** &rarr; returns a `301` or `302` with a `Location` header pointing to `/success?from=<path>&to=<real_destination>`.
5. The browser follows the redirect to `/success`, which is handled by the same **Compute service** at the same POP.
6. The **edge worker** reads the `from` and `to` query parameters and generates a styled HTML confirmation page — entirely at the edge.
7. **No match** &rarr; returns `404`.

No origin. No backend. The full redirect lifecycle — including the visual confirmation — completes at the edge.

## Project Structure

```
.
├── fastly.toml              # Compute manifest + local Viceroy config
├── package.json             # JS dependencies (@fastly/js-compute)
├── src/
│   └── index.js             # Edge worker (Compute service)
├── local_stores/
│   └── redirects.json       # Local redirect table for Viceroy simulation
└── README.md
```

## Local Development

The project includes a **local redirect table** (`local_stores/redirects.json`) so you can run the full redirect flow on your machine using [Viceroy](https://github.com/fastly/Viceroy), Fastly's local **Compute** emulator. No Fastly account or cloud resources required.

```bash
# Install dependencies
npm install

# Build the WASM binary
fastly compute build

# Start the local dev server (Viceroy, port 7676)
fastly compute serve
```

Viceroy reads the `[local_server.dictionaries.redirects]` block in `fastly.toml` and loads `local_stores/redirects.json` as the **Config Store**. The JavaScript SDK accesses it identically to production — no code changes needed.

### Smoke Test (local)

With the local dev server running on `127.0.0.1:7676`:

```bash
# Landing page (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7676/
# Expected: 200

# Permanent redirect — follows to /success interception page (301)
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}" http://127.0.0.1:7676/old-blog
# Expected: 301 → http://127.0.0.1:7676/success?from=/old-blog&to=https://www.fastly.com/blog

# Temporary redirect (302)
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}" http://127.0.0.1:7676/promo
# Expected: 302 → http://127.0.0.1:7676/success?from=/promo&to=https://www.fastly.com

# No redirect configured (404)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7676/does-not-exist
# Expected: 404

# Healthcheck
curl http://127.0.0.1:7676/_redirects/healthcheck
# Expected: ok
```

## Production Deployment

### Prerequisites

- [Fastly CLI](https://developer.fastly.com/learning/tools/cli) installed
- A Fastly API token with **Compute** and **Config Store** permissions
- Authenticated: `fastly auth login --sso` or set `FASTLY_API_TOKEN`

### Deploy

```bash
# Build and deploy in one step.
# On first run, the CLI creates the Compute service, the Config Store
# ("redirects"), and links them together automatically.
fastly compute publish
```

The CLI reads the `[setup.config_stores.redirects]` block in `fastly.toml` and prompts you to create the **Config Store** (**edge dictionary**) during the initial deployment.

### Populate the Redirect Table

After the service is live, add your redirect entries to the **Config Store** (**bulk redirect table**):

```bash
# Grab the Config Store ID
STORE_ID=$(fastly config-store list --json | jq -r '.[] | select(.name=="redirects") | .id')

# Add entries — key is the source path, value is "STATUS:DESTINATION"
fastly config-store-entry create --store-id $STORE_ID \
  --key "/promo" \
  --value "302:/success?from=/promo&to=https://www.fastly.com"

fastly config-store-entry create --store-id $STORE_ID \
  --key "/old-blog" \
  --value "301:/success?from=/old-blog&to=https://www.fastly.com/blog"
```

**Config Store** updates propagate globally in approximately 30 seconds. No redeploy needed — add, update, or delete entries and the edge picks them up.

### Smoke Test (production)

Replace `YOUR-DOMAIN.edgecompute.app` with the domain assigned during deploy:

```bash
# Landing page (200)
curl -s -o /dev/null -w "%{http_code}" https://YOUR-DOMAIN.edgecompute.app/
# Expected: 200

# Temporary redirect to /success interception page (302)
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}" https://YOUR-DOMAIN.edgecompute.app/promo
# Expected: 302 → https://YOUR-DOMAIN.edgecompute.app/success?from=/promo&to=https://www.fastly.com

# Permanent redirect (301)
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}" https://YOUR-DOMAIN.edgecompute.app/old-blog
# Expected: 301 → https://YOUR-DOMAIN.edgecompute.app/success?from=/old-blog&to=https://www.fastly.com/blog

# Unmatched path (404)
curl -s -o /dev/null -w "%{http_code}" https://YOUR-DOMAIN.edgecompute.app/nope
# Expected: 404

# Healthcheck
curl https://YOUR-DOMAIN.edgecompute.app/_redirects/healthcheck
# Expected: ok
```

## Managing Redirects

The **redirect table** (**Config Store**) entry format is: **key** = source path, **value** = `STATUS_CODE:DESTINATION`.

| Source Path | Config Store Value | Behavior |
| --- | --- | --- |
| `/promo` | `302:/success?from=/promo&to=https://www.fastly.com` | Temporary (not cached) |
| `/old-blog` | `301:/success?from=/old-blog&to=https://www.fastly.com/blog` | Permanent (cached) |
| `/docs/v1` | `301:/success?from=/docs/v1&to=https://docs.fastly.com` | Permanent (cached) |
| `/careers` | `301:/success?from=/careers&to=https://www.fastly.com/about/careers` | Permanent (cached) |

**For local development**, edit `local_stores/redirects.json` and restart the dev server.

**For production**, use the CLI:

```bash
# Add or update a redirect (upsert)
fastly config-store-entry update --store-id $STORE_ID \
  --key "/new-path" \
  --value "301:/success?from=/new-path&to=https://example.com/destination" \
  --upsert

# Remove a redirect
fastly config-store-entry delete --store-id $STORE_ID --key "/old-path"
```

## Why Config Store and Not KV Store?

Both Fastly store types could power a **bulk redirect table**, but the **Config Store** (**edge dictionary**) is the better fit:

| Concern | Config Store | KV Store |
| --- | --- | --- |
| Access pattern | Synchronous `get(key)` | Async `await get(key)` |
| Data locality | In-memory at every POP | Network hop to storage layer |
| Value size limit | 8 KB | 25 MB |
| Update propagation | ~30 seconds globally | Near real-time |
| Best for | Small, read-heavy config lookups | Large or frequently mutated data |

Redirect entries are small (a URL string), read-heavy, and infrequently updated — a textbook **Config Store** use case. The synchronous read path avoids async overhead and keeps per-request latency minimal.

## Teardown

When you are done experimenting, remove both the **Compute** service and the **Config Store** to stop resource usage:

```bash
# 1. Get your service ID
SID=$(fastly service list --json | jq -r '.[] | select(.Name=="fastly-bulk-redirects") | .ServiceID')

# 2. Get the Config Store ID
STORE_ID=$(fastly config-store list --json | jq -r '.[] | select(.name=="redirects") | .id')

# 3. Delete the Config Store (removes all entries)
fastly config-store delete --store-id $STORE_ID

# 4. Delete the Compute service
fastly service delete --service-id $SID --force
```

Verify cleanup with `fastly service list` and `fastly config-store list`.
