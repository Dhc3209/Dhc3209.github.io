# CPR Home Pros — GoDaddy DNS cutover package (GitHub Pages)

**Status:** DOCUMENTATION ONLY — **do not flip DNS yet.**  
**Prepared:** 2026-09-19 (ET)  
**Audience:** Website Editor / Daniel  
**Staging (live, noindex):** https://dhc3209.github.io/  
**Staging source repo:** https://github.com/Dhc3209/cprhomepros-website-staging  
**Pages mirror repo:** https://github.com/Dhc3209/Dhc3209.github.io  
**Production domain (still Townsquare until cutover):** `cprhomepros.com` / `www.cprhomepros.com`

This file is a **copy-paste plan for a future cutover day**. It does **not** change DNS, does **not** add a `CNAME` file, does **not** remove `noindex`, and does **not** change FormSubmit or NAP. Leave verified GBP / SSL / FormSubmit alone until an explicit go-live.

---

## 1. Copy-paste DNS table (GoDaddy → DNS Management)

**Domain:** `cprhomepros.com`  
**Target host:** GitHub Pages user site `Dhc3209.github.io`  
**When to apply:** Only on cutover day after pre-flight checklist below is green. Until then, leave current Townsquare records untouched.

### Required records (apply on cutover)

| Type | Name / Host | Value / Points to | TTL | Notes |
|------|-------------|-------------------|-----|-------|
| **A** | `@` | `185.199.108.153` | 600 (or 1 Hour) | Apex → GitHub Pages |
| **A** | `@` | `185.199.109.153` | 600 (or 1 Hour) | Apex → GitHub Pages |
| **A** | `@` | `185.199.110.153` | 600 (or 1 Hour) | Apex → GitHub Pages |
| **A** | `@` | `185.199.111.153` | 600 (or 1 Hour) | Apex → GitHub Pages |
| **CNAME** | `www` | `Dhc3209.github.io` | 600 (or 1 Hour) | Must end without trailing dot in GoDaddy UI |

### Optional IPv6 (recommended with the A records)

| Type | Name / Host | Value / Points to | TTL |
|------|-------------|-------------------|-----|
| **AAAA** | `@` | `2606:50c0:8000::153` | 600 |
| **AAAA** | `@` | `2606:50c0:8001::153` | 600 |
| **AAAA** | `@` | `2606:50c0:8002::153` | 600 |
| **AAAA** | `@` | `2606:50c0:8003::153` | 600 |

### What to remove / replace on cutover (do not do today)

- Remove or replace any existing apex **A** / **AAAA** / **ALIAS** / **ANAME** records that point at Townsquare (or any non–GitHub Pages IPs).
- Remove any existing **CNAME** on `www` that does **not** point to `Dhc3209.github.io`.
- Do **not** leave duplicate apex A records mixing old host + GitHub IPs — that breaks SSL provisioning.
- Leave unrelated records alone (MX/email, TXT for SPF/DKIM/DMARC, domain verification TXT, etc.) unless they conflict with the rows above.

### GoDaddy UI tips

1. GoDaddy → **My Products** → **DNS** / **Manage DNS** for `cprhomepros.com`.
2. For apex: Type **A**, Name **`@`**, four separate rows (one IP each).
3. For www: Type **CNAME**, Name **`www`**, Value **`Dhc3209.github.io`**.
4. Prefer a short TTL (600s) the day before cutover so rollback is faster; raise TTL after SSL is green.

### Verify after change (cutover day only)

```bash
dig cprhomepros.com +noall +answer -t A
dig www.cprhomepros.com +noall +answer -t CNAME
# Expect four GitHub A IPs on apex; www CNAME → Dhc3209.github.io
```

Official docs: [Managing a custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

---

## 2. GitHub Pages custom domain + SSL / Enforce HTTPS

**Do these steps on cutover day only** (after DNS points at Pages, or immediately before if GitHub will wait for DNS).

1. In **Dhc3209/Dhc3209.github.io** → **Settings** → **Pages**.
2. Set **Custom domain** to the chosen canonical host:
   - **Recommended canonical:** `cprhomepros.com` (apex), **or**
   - `www.cprhomepros.com` if you prefer www as primary.
3. Wait for DNS check + Let’s Encrypt certificate (**Certificate not yet created** can take minutes; retry remove/re-add domain if stuck).
4. When the checkmark appears, enable **Enforce HTTPS**.
5. Confirm both apex and `www` resolve over HTTPS with no mixed-content warnings.
6. If both apex A records **and** www CNAME are correct, GitHub Pages will auto-redirect the non-canonical host to the custom domain you set in Pages settings (single hop).

**Important today:** Staging stays on `https://dhc3209.github.io/` with **no** production `CNAME` file and **no** custom domain in Pages settings. Do not add `CNAME` or custom domain until go-live — that would start SSL/domain verification against production DNS that still points at Townsquare.

---

## 3. 301 / REDIRECT-MAP summary + GitHub Pages limits

Full map: `REDIRECT-MAP.md`. Machine list for Vercel-style hosts: `vercel.json` (`redirects` + `rewrites`).

### Preserve in place (serve new page at same path — do **not** self-301)

`/`, `/contact-us`, `/services`, `/roofing`, `/roof-repair-and-replacement`, `/new-construction-roofing`, `/commercial-roofing`, `/metal-roofing`, `/designer-shingles`, `/gutters`, `/skylights`, `/portfolio`, `/reviews`, `/faq`, `/areas-we-serve`, `/velux-products`, plus materials pages served in place (`/brava-slate-roofing-tile`, `/brava-spanish-roofing-tile`, `/brava-cedar-shake-roofing-tile`, etc.).

### Must-cover 301 set (old path → final clean path)

| Old path | → New path |
|----------|------------|
| `/about-us` *or* keep `/about-us` if that is the live slug | Staging currently uses `/about-us/` as primary; align with `README.md` / live folders |
| `/about` | `/about-us` (or `/about` if chosen) |
| `/resources` | `/faq` |
| `/service-area/denver-nc` (and cornelius, huntersville, mooresville, davidson, concord) | `/areas-we-serve` |
| Article URLs (roof-repair-vs-…, planning-gutter-…, comparing-metal-…, navigating-insurance-…, key-steps-commercial-…, which-designer-shingles-…, understanding-skylight-…, reliable-gutter-…, comprehensive-new-construction-…, complete-gutter-…, expert-roof-repair-…, how-metal-roofing-…, professional-roof-replacement-…) | Closest service page (see `REDIRECT-MAP.md`) |
| Stale 404s `/bathroom-remodels`, `/handyman-services`, `/painting_drywall` | `/services` |

### GitHub Pages redirect limits (critical)

- **GitHub Pages does not execute `vercel.json`.** Rewrites/redirects in `vercel.json` work on Vercel only.
- On pure Pages, 301s are typically implemented as:
  - **Static HTML stubs** at old paths (meta refresh / JS already used for some `.html` → folder paths on staging), or
  - A **proxy/CDN in front** (Cloudflare Transform Rules / Page Rules) that issues real HTTP 301s, or
  - Moving hosting to a platform that honors `vercel.json` / `_redirects`.
- Meta refresh stubs are **not** true HTTP 301s for SEO; prefer CDN or platform 301s for indexed URLs before canceling Townsquare.
- Keep **one hop** only: old URL → final canonical URL. Never redirect a URL to itself.
- Canonical host must match DNS + Pages custom domain + tags + sitemap + GBP + Search Console (see `REDIRECT-MAP.md` § Canonical host). Historical live behavior was apex → www; new recommended canonical is **apex** if Pages custom domain is set to `cprhomepros.com`.

---

## 4. Go-live checklist (cutover day — not today)

Do **not** perform these until DNS flip is authorized. Listed here so Website Editor / Daniel have a single runbook.

### A. Remove noindex (staging locks today)

Today staging has all of:

- `robots.txt` → `Disallow: /`
- `<meta name="robots" content="noindex, nofollow">` on pages
- `X-Robots-Tag: noindex, nofollow` via `vercel.json` headers (Vercel only; Pages ignores this header file)

**On go-live:** allow indexing (`Allow: /` or remove Disallow), remove `noindex` meta, drop noindex headers, submit sitemap in Search Console.

### B. FormSubmit success URL

Forms POST to `https://formsubmit.co/Daniel@cprhomepros.com`.

**Current staging `_next` (do not change until go-live):**

```text
https://dhc3209.github.io/contact-us/?submitted=1
```

**On go-live, update `_next` to the production contact thank-you URL**, e.g.:

```text
https://cprhomepros.com/contact-us/?submitted=1
```

(or `https://www.cprhomepros.com/...` if www is canonical). Confirm FormSubmit’s email confirmation link has already been clicked once for `Daniel@cprhomepros.com` so leads deliver.

**Do not edit FormSubmit fields today** — changing `_next` or endpoints can force re-confirmation / break verified delivery.

### C. Denver-only NAP (verify consistency — do not rewrite today)

Public NAP already used on staging footer / contact:

| Field | Value |
|-------|--------|
| **N**ame | Campbells Precision Roofing (display) / CPR Home Pros (domain) |
| **A**ddress | 7730 Campground Rd, Denver, NC 28037 |
| **P**hone | (704) 280-5996 |
| **Email** | Daniel@cprhomepros.com |

**On go-live:** keep **one** Denver NAP everywhere (footer, contact, schema if any, GBP). Do not invent a second address. Do not change GBP name/address/categories as part of hosting cutover unless separately verified (`CUTOVER-CHECKLIST.md` §3). After the site answers on the canonical host, update GBP **website URL** only.

### D. Immediate post-DNS smoke tests

- [ ] `https://cprhomepros.com` and `https://www.cprhomepros.com` load with valid cert; Enforce HTTPS on.
- [ ] Homepage, contact, services, areas, form submit, click-to-call, SMS, mailto.
- [ ] Sample of must-cover 301s return one-hop 301 (or documented interim stubs).
- [ ] `robots.txt` / sitemap allow indexing; no leftover `noindex`.
- [ ] FormSubmit `_next` lands on production thank-you.
- [ ] NAP matches Denver address + (704) 280-5996.
- [ ] Keep Townsquare active until stable; cancel last (`CUTOVER-CHECKLIST.md` §5).

---

## 5. Explicit non-actions (this package)

| Action | Status |
|--------|--------|
| Flip GoDaddy DNS | **NOT DONE** — docs only |
| Add/edit `CNAME` in github.io | **NOT DONE** |
| Set Pages custom domain | **NOT DONE** |
| Remove noindex / open robots.txt | **NOT DONE** |
| Change FormSubmit `_next` or action | **NOT DONE** |
| Change NAP / GBP address | **NOT DONE** |
| Cancel Townsquare | **NOT DONE** |

---

## 6. Related files

- `REDIRECT-MAP.md` — full old→new map and crawl notes  
- `CUTOVER-CHECKLIST.md` — staging, redirects, GBP, DNS, cancel-Townsquare order  
- `README.md` — staging paths, FormSubmit overview, SEO locks  
- `vercel.json` — rewrites + redirects for Vercel (not honored by GitHub Pages)

