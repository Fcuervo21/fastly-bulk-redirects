/// <reference types="@fastly/js-compute" />
import { ConfigStore } from "fastly:config-store";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  const url = new URL(event.request.url);
  const path = url.pathname;

  if (path === "/_redirects/healthcheck") {
    return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (path === "/") {
    return new Response(landingPageHTML(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }

  if (path === "/success") {
    const from = escapeHTML(url.searchParams.get("from") || "(unknown)");
    const to = url.searchParams.get("to") || "";
    const toDisplay = escapeHTML(to);
    const toHref = escapeAttr(to);
    return new Response(successPageHTML(from, toDisplay, toHref), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  const redirects = new ConfigStore("redirects");
  const entry = redirects.get(path);

  if (!entry) {
    return new Response(`No redirect configured for ${path}\n`, {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const sep = entry.indexOf(":");
  const status = parseInt(entry.substring(0, sep), 10);
  const destination = entry.substring(sep + 1);

  return new Response(null, {
    status,
    headers: {
      "Location": destination,
      "Cache-Control": status === 301 ? "public, max-age=86400" : "no-cache",
      "X-Redirect-Source": "fastly-bulk-redirects",
    },
  });
}

function escapeHTML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  if (!/^https?:\/\//i.test(str)) return "";
  return escapeHTML(str);
}

function landingPageHTML() {
  const routes = [
    { path: "/promo", status: 302, dest: "fastly.com", label: "Promo (temporary)" },
    { path: "/old-blog", status: 301, dest: "fastly.com/blog", label: "Old Blog (permanent)" },
    { path: "/legacy/about-us", status: 301, dest: "fastly.com/about", label: "Legacy About Us" },
    { path: "/docs/v1", status: 301, dest: "docs.fastly.com", label: "Docs v1 → v2" },
    { path: "/careers", status: 301, dest: "fastly.com/about/careers", label: "Careers" },
    { path: "/sale", status: 302, dest: "fastly.com/products/compute", label: "Compute Platform" },
  ];

  const routeCards = routes.map(r => `
    <a href="${r.path}" class="card">
      <div class="card-header">
        <code class="path">${r.path}</code>
        <span class="badge ${r.status === 301 ? "permanent" : "temporary"}">${r.status}</span>
      </div>
      <p class="dest">→ ${r.dest}</p>
      <p class="label">${r.label}</p>
    </a>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fastly Bulk Redirects — Edge Demo</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f0f13;
    color: #e2e2e8;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  header {
    width: 100%;
    padding: 2.5rem 1rem 2rem;
    text-align: center;
    background: linear-gradient(170deg, #1a1a24 0%, #0f0f13 100%);
    border-bottom: 1px solid #2a2a36;
  }
  header h1 {
    font-size: 1.8rem;
    font-weight: 700;
    background: linear-gradient(135deg, #ff282d 0%, #ff6b6b 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: .4rem;
  }
  header p { color: #9090a0; font-size: .95rem; max-width: 520px; margin: 0 auto; line-height: 1.5; }
  main { width: 100%; max-width: 780px; padding: 2rem 1rem 3rem; }
  .how-it-works {
    background: #16161e;
    border: 1px solid #2a2a36;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }
  .how-it-works h2 { font-size: 1rem; color: #c0c0d0; margin-bottom: .75rem; }
  .how-it-works p { font-size: .85rem; color: #8888a0; line-height: 1.65; }
  .how-it-works code { background: #22222e; padding: .15rem .4rem; border-radius: 4px; font-size: .8rem; color: #ff6b6b; }
  h3 { font-size: 1rem; color: #a0a0b4; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: .08em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: .75rem; }
  .card {
    display: block;
    text-decoration: none;
    color: inherit;
    background: #16161e;
    border: 1px solid #2a2a36;
    border-radius: 10px;
    padding: 1.1rem;
    transition: border-color .15s, transform .15s;
  }
  .card:hover { border-color: #ff282d; transform: translateY(-2px); }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
  .path { font-size: .9rem; color: #fff; }
  .badge {
    font-size: .65rem;
    font-weight: 700;
    padding: .2rem .5rem;
    border-radius: 20px;
    letter-spacing: .04em;
  }
  .badge.permanent { background: #1b3a2d; color: #4ade80; }
  .badge.temporary { background: #3a2e1b; color: #fbbf24; }
  .dest { font-size: .75rem; color: #7070a0; margin-bottom: .3rem; word-break: break-all; }
  .label { font-size: .8rem; color: #9090a8; }
  footer { padding: 1.5rem; text-align: center; font-size: .75rem; color: #555; }
  footer a { color: #ff6b6b; text-decoration: none; }
</style>
</head>
<body>
<header>
  <h1>Fastly Bulk Redirects</h1>
  <p>An edge-powered redirect engine built on Fastly Compute and Config Store. Zero origin, sub-millisecond redirects at the edge.</p>
</header>
<main>
  <div class="how-it-works">
    <h2>How it works</h2>
    <p>
      Incoming request paths are looked up in a <code>Config Store</code> — Fastly's
      globally distributed key-value store. Each entry maps a source path to a
      <code>status:destination</code> pair (e.g. <code>301:https://fastly.com/blog</code>).
      The Compute service reads the entry, extracts the HTTP status code and target URL,
      and returns an instant redirect — all at the edge, with no origin round-trip.
    </p>
  </div>
  <h3>Try the redirects</h3>
  <div class="grid">${routeCards}</div>
</main>
<footer>Powered by <a href="https://www.fastly.com/products/compute" target="_blank" rel="noopener">Fastly Compute</a></footer>
</body>
</html>`;
}

function successPageHTML(from, toDisplay, toHref) {
  const continueLink = toHref
    ? `<a href="${toHref}" class="btn primary" target="_blank" rel="noopener">Continue to ${toDisplay}</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Redirect Successful — Fastly Edge Demo</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f0f13;
    color: #e2e2e8;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .container {
    max-width: 600px;
    padding: 2.5rem;
    text-align: center;
  }
  .checkmark {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1b3a2d 0%, #0f2920 100%);
    border: 2px solid #4ade80;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
    font-size: 2.2rem;
  }
  h1 {
    font-size: 1.6rem;
    font-weight: 700;
    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 1.2rem;
  }
  .detail {
    background: #16161e;
    border: 1px solid #2a2a36;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    text-align: left;
    font-size: .9rem;
    line-height: 1.7;
    color: #b0b0c0;
  }
  .detail code {
    background: #22222e;
    padding: .15rem .45rem;
    border-radius: 4px;
    font-size: .85rem;
    color: #ff6b6b;
  }
  .flow {
    display: flex;
    align-items: center;
    gap: .6rem;
    justify-content: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .flow-step {
    background: #16161e;
    border: 1px solid #2a2a36;
    border-radius: 8px;
    padding: .5rem .9rem;
    font-size: .8rem;
    color: #c0c0d0;
  }
  .flow-arrow { color: #4ade80; font-size: 1.2rem; }
  .actions { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
  .btn {
    display: inline-block;
    text-decoration: none;
    font-size: .85rem;
    font-weight: 600;
    padding: .65rem 1.4rem;
    border-radius: 8px;
    transition: transform .15s, opacity .15s;
  }
  .btn:hover { transform: translateY(-1px); opacity: .9; }
  .btn.primary { background: #ff282d; color: #fff; }
  .btn.secondary { background: #22222e; color: #c0c0d0; border: 1px solid #3a3a48; }
  footer { position: fixed; bottom: 0; width: 100%; padding: 1rem; text-align: center; font-size: .75rem; color: #555; }
  footer a { color: #ff6b6b; text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <div class="checkmark">&#10003;</div>
  <h1>Redirect Successful!</h1>

  <div class="flow">
    <span class="flow-step"><code>${from}</code></span>
    <span class="flow-arrow">&#8594;</span>
    <span class="flow-step">Edge Lookup</span>
    <span class="flow-arrow">&#8594;</span>
    <span class="flow-step">/success</span>
  </div>

  <div class="detail">
    <p>You visited <code>${from}</code> and Fastly instantly redirected you here &mdash; entirely at the edge, with zero origin round-trip.</p>
    <br>
    <p>In a real scenario, you would now be at:<br><code>${toDisplay}</code></p>
    <br>
    <p>This redirect was resolved by looking up the path in a <code>Config Store</code> &mdash; Fastly&rsquo;s globally distributed key-value store &mdash; and returning an HTTP redirect in sub-millisecond time.</p>
  </div>

  <div class="actions">
    <a href="/" class="btn secondary">&#8592; Back to Demo</a>
    ${continueLink}
  </div>
</div>
<footer>Powered by <a href="https://www.fastly.com/products/compute" target="_blank" rel="noopener">Fastly Compute</a></footer>
</body>
</html>`;
}
