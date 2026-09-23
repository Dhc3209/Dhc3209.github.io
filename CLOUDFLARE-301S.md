# Cloudflare HTTP 301 redirect rules — CPR (cprhomepros.com)

**Status (2026-09-23):** Cloudflare **NOW fronts the apex** (`cprhomepros.com`). Live responses show `server: cloudflare`. Prefer edge **HTTP 301** Redirect Rules over GitHub Pages meta-refresh stubs (200 + refresh + `noindex`).

**Operator note:** This file is the paste list for Cloudflare **Redirect Rules** (dashboard or API). Rules must still be configured in Cloudflare — committing here does not apply them at the edge. One hop. Apex final URL with trailing slash. Do **not** 301 a preserve-in-place URL to itself.

When a CF 301 is live for a From path, remove the GH Pages soft stub so origin no longer returns 200+refresh for that URL.

---

## P1 blog-fix 2026-09-23

Applied at Cloudflare edge (Free Single Redirects, 10/10 slots). Verified via `--resolve cprhomepros.com:443:104.21.55.139`:

| From | To | Notes |
|------|----|-------|
| `/roof-repair`, `/roof-repair/`, `/roof-replacement`, `/roof-replacement/` | `/roof-repair-and-replacement/` | One merged rule |
| `/areas`, `/areas/` | `/areas-we-serve/` | New rule |
| `/gutters` (no slash) | `/gutters/` | OR’d onto existing P0 gutter-install rule |

Also shipped in repo (live `be6b3ce`): leak post in `sitemap.xml`; branded root `404.html`. Soft HTML stubs may remain as origin safety net for stale DNS.

## P0 Ryze 2026-09-23 (priority batch)

Apply these Redirect Rules first (301 → apex trailing-slash URL):

| From | To |
|---|---|
| `/contact` | `/contact-us/` |
| `/contact/` | `/contact-us/` |
| `/resources` | `/faq/` |
| `/resources/` | `/faq/` |
| `/roof-repair-vs-full-replacement-in-denver-nc-how-to-decide` | `/roof-repair-and-replacement/` |
| `/roof-repair-vs-full-replacement-in-denver-nc-how-to-decide/` | `/roof-repair-and-replacement/` |
| `/complete-gutter-installation-services-in-mooresville-nc` | `/gutters/` |
| `/complete-gutter-installation-services-in-mooresville-nc/` | `/gutters/` |
| `/key-steps-in-commercial-roofing-projects-in-huntersville-nc` | `/commercial-roofing/` |
| `/key-steps-in-commercial-roofing-projects-in-huntersville-nc/` | `/commercial-roofing/` |
| `/About-Us.htm` | `/about-us/` |
| `/about-us.htm` | `/about-us/` |
| `/home.htm` | `/` |
| `/Home.htm` | `/` |

Pages soft meta-refresh stubs for the P0 From paths above (incl. `.htm`) are interim for DNS cache lag so GitHub origin does not 404; Cloudflare Redirect Rules remain the true 301 when proxied.

---
## Prefer HTTP 301 (From → To)

| From | To |
|---|---|
| `/about` | `/about-us/` |
| `/about/` | `/about-us/` |
| `/contact` | `/contact-us/` |
| `/contact/` | `/contact-us/` |
| `/resources` | `/faq/` |
| `/resources/` | `/faq/` |
| `/timberline-uhdz` | `/timberline-hdz/` |
| `/timberline-uhdz/` | `/timberline-hdz/` |
| `/service-area/davidson-nc` | `/areas-we-serve/` |
| `/service-area/davidson-nc/` | `/areas-we-serve/` |
| `/service-area/concord-nc` | `/areas-we-serve/` |
| `/service-area/concord-nc/` | `/areas-we-serve/` |
| `/bathroom-remodels` | `/services/` |
| `/bathroom-remodels/` | `/services/` |
| `/handyman-services` | `/services/` |
| `/handyman-services/` | `/services/` |
| `/painting_drywall` | `/services/` |
| `/painting_drywall/` | `/services/` |
| `/roof-repair-vs-full-replacement-in-denver-nc-how-to-decide` | `/roof-repair-and-replacement/` |
| `/roof-repair-vs-full-replacement-in-denver-nc-how-to-decide/` | `/roof-repair-and-replacement/` |
| `/planning-gutter-systems-for-concord-nc-properties` | `/gutters/` |
| `/planning-gutter-systems-for-concord-nc-properties/` | `/gutters/` |
| `/comparing-metal-roofing-benefits-in-davidson-nc` | `/metal-roofing/` |
| `/comparing-metal-roofing-benefits-in-davidson-nc/` | `/metal-roofing/` |
| `/navigating-insurance-claims-for-hail-damage-in-mooresville-nc` | `/storm-damage-insurance-claims/` |
| `/navigating-insurance-claims-for-hail-damage-in-mooresville-nc/` | `/storm-damage-insurance-claims/` |
| `/key-steps-in-commercial-roofing-projects-in-huntersville-nc` | `/commercial-roofing/` |
| `/key-steps-in-commercial-roofing-projects-in-huntersville-nc/` | `/commercial-roofing/` |
| `/which-designer-shingles-enhance-cornelius-nc-homes` | `/designer-shingles/` |
| `/which-designer-shingles-enhance-cornelius-nc-homes/` | `/designer-shingles/` |
| `/understanding-skylight-installation-services-in-denver-nc` | `/skylights/` |
| `/understanding-skylight-installation-services-in-denver-nc/` | `/skylights/` |
| `/reliable-gutter-repair-solutions-in-concord-nc` | `/gutters/` |
| `/reliable-gutter-repair-solutions-in-concord-nc/` | `/gutters/` |
| `/comprehensive-new-construction-roofing-in-davidson-nc` | `/new-construction-roofing/` |
| `/comprehensive-new-construction-roofing-in-davidson-nc/` | `/new-construction-roofing/` |
| `/complete-gutter-installation-services-in-mooresville-nc` | `/gutters/` |
| `/complete-gutter-installation-services-in-mooresville-nc/` | `/gutters/` |
| `/expert-roof-repair-solutions-in-huntersville-nc` | `/roof-repair-and-replacement/` |
| `/expert-roof-repair-solutions-in-huntersville-nc/` | `/roof-repair-and-replacement/` |
| `/how-metal-roofing-protects-homes-in-cornelius-nc` | `/metal-roofing/` |
| `/how-metal-roofing-protects-homes-in-cornelius-nc/` | `/metal-roofing/` |
| `/professional-roof-replacement-services-in-denver-nc` | `/roof-repair-and-replacement/` |
| `/professional-roof-replacement-services-in-denver-nc/` | `/roof-repair-and-replacement/` |
| `/About-Us.htm` | `/about-us/` |
| `/about-us.htm` | `/about-us/` |
| `/home.htm` | `/` |
| `/Home.htm` | `/` |

### Optional / host

| From | To |
|---|---|
| `https://www.cprhomepros.com/*` | `https://cprhomepros.com/$1` (www → apex, single hop) |
| Legacy Townsquare / Duda host URLs | apex `https://cprhomepros.com$uri` when Cloudflare fronts |

### Do **NOT** 301 (real pages — ship 2026-09-21 / Lake Norman pack 2026-09-22)

- `/service-area/denver-nc/` — real town page
- `/service-area/cornelius-nc/` — real town page
- `/service-area/huntersville-nc/` — real town page
- `/service-area/mooresville-nc/` — real town page (2026-09-22). **Remove** any CF rule that sent this path → `/areas-we-serve/`.
- `/service-area/sherrills-ford-nc/` — real town page (2026-09-22). Do not 301.
- All must-keep URLs in SHIP / WEEK-PACK §C1 (`/`, `/about-us/`, `/roofing/`, `/storm-damage-insurance-claims/`, etc.)

---

## Interim (GitHub Pages)

Remaining non-P0 meta-refresh stubs may still ship at other From paths (and `/about.html`). They return **200** + refresh — **not** equity-equivalent to HTTP 301. Replace with Cloudflare edge 301s (this paste list). P0 directory stubs removed 2026-09-23.

Shipped: 2026-09-21 · Source: `SHIP-TOWN-PAGES-2026-09-21.md` + WEEK-PACK §C2 · P0 update: 2026-09-23
