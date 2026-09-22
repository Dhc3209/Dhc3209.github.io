# CPR Home Pros 301 Redirect Map

**Prepared:** 2026-09-18 (ET)  
**Source crawl:** `https://www.cprhomepros.com` homepage, robots.txt, sitemap.xml, homepage/nav links, service-area pages, resource/article URLs, and common paths. The live sitemap returned 39 URLs; all 39 returned HTTP 200 with curl. The homepage also exposes `/velux-products` (HTTP 200), which is included below.

## New-site HTML paths

These are the HTML mock pages currently in `/workspace/cpr-redesign/`. The recommended production URLs below are clean paths; configure App Builder rewrites/routes to serve the corresponding `.html` file. If the deployment only exposes literal filenames, use the mock `.html` path as the destination instead and do not create a redirect loop.

- `index.html` → `/`
- `about.html` → `/about`
- `areas.html` → `/areas-we-serve`
- `commercial.html` → `/commercial-roofing`
- `contact.html` → `/contact-us`
- `designer-shingles.html` → `/designer-shingles`
- `faq.html` → `/faq`
- `financing.html` → `/financing`
- `gutters.html` → `/gutters`
- `metal.html` → `/metal-roofing`
- `new-construction.html` → `/new-construction-roofing`
- `portfolio.html` → `/portfolio`
- `repair.html` → `/roof-repair-and-replacement`
- `reviews.html` → `/reviews`
- `roofing.html` → `/roofing`
- `services.html` → `/services`
- `skylights.html` → `/skylights`
- `storm-damage-insurance-claims.html` → `/storm-damage-insurance-claims`
- `velux.html` → `/velux-products`

`styles.css`, `nav.js`, and image/logo files are assets, not redirect destinations.

## Redirect map

`301` means the old URL should permanently redirect to the recommended clean live URL. `Preserve` means serve the new page at the same clean URL; a same-to-same 301 would be an invalid self-redirect. Every old sitemap service, area, contact, and content URL is represented.

| Old live path | New mock path | Recommended live path | Action / reason |
|---|---|---|---|
| `/` | `index.html` | `/` | Preserve; serve new homepage. |
| `/about-us` | `about.html` | `/about` | **301**; new About slug. |
| `/contact-us` | `contact.html` | `/contact-us` | Preserve; indexed contact URL. |
| `/services` | `services.html` | `/services` | Preserve; indexed services URL. |
| `/roofing` | `roofing.html` | `/roofing` | Preserve; indexed service URL. |
| `/roof-repair-and-replacement` | `repair.html` | `/roof-repair-and-replacement` | Preserve; indexed service URL. |
| `/new-construction-roofing` | `new-construction.html` | `/new-construction-roofing` | Preserve; indexed service URL. |
| `/commercial-roofing` | `commercial.html` | `/commercial-roofing` | Preserve; indexed service URL. |
| `/metal-roofing` | `metal.html` | `/metal-roofing` | Preserve; indexed service URL. |
| `/designer-shingles` | `designer-shingles.html` | `/designer-shingles` | Preserve; indexed service URL. |
| `/gutters` | `gutters.html` | `/gutters` | Preserve; indexed service URL. |
| `/skylights` | `skylights.html` | `/skylights` | Preserve; indexed service URL. |
| `/portfolio` | `portfolio.html` | `/portfolio` | Preserve; indexed portfolio URL. |
| `/reviews` | `reviews.html` | `/reviews` | Preserve; indexed reviews URL. |
| `/faq` | `faq.html` | `/faq` | Preserve; indexed FAQ URL. |
| `/resources` | `faq.html` | `/faq` | **301**; FAQ/resources mock is the closest replacement. |
| `/areas-we-serve` | `areas.html` | `/areas-we-serve` | Preserve; indexed area index. |
| `/service-area/denver-nc` | `areas.html` | `/areas-we-serve` | **301**; no city-specific mock page; closest parent. |
| `/service-area/cornelius-nc` | `areas.html` | `/areas-we-serve` | **301**; no city-specific mock page; closest parent. |
| `/service-area/huntersville-nc` | `areas.html` | `/areas-we-serve` | **301**; no city-specific mock page; closest parent. |
| `/service-area/mooresville-nc` | `service-area/mooresville-nc/index.html` | `/service-area/mooresville-nc` | **Serve in place** (real town page 2026-09-22). Do **not** 301 to Areas. |
| `/service-area/sherrills-ford-nc` | `service-area/sherrills-ford-nc/index.html` | `/service-area/sherrills-ford-nc` | **Serve in place** (new town page 2026-09-22). |
| `/service-area/davidson-nc` | `areas.html` | `/areas-we-serve` | **301**; no city-specific mock page; closest parent. |
| `/service-area/concord-nc` | `areas.html` | `/areas-we-serve` | **301**; no city-specific mock page; closest parent. |
| `/roof-repair-vs-full-replacement-in-denver-nc-how-to-decide` | `repair.html` | `/roof-repair-and-replacement` | **301**; article has no new equivalent. |
| `/planning-gutter-systems-for-concord-nc-properties` | `gutters.html` | `/gutters` | **301**; article has no new equivalent. |
| `/comparing-metal-roofing-benefits-in-davidson-nc` | `metal.html` | `/metal-roofing` | **301**; article has no new equivalent. |
| `/navigating-insurance-claims-for-hail-damage-in-mooresville-nc` | `storm-damage-insurance-claims.html` | `/storm-damage-insurance-claims` | **301**; closest new storm/claims page. |
| `/key-steps-in-commercial-roofing-projects-in-huntersville-nc` | `commercial.html` | `/commercial-roofing` | **301**; article has no new equivalent. |
| `/which-designer-shingles-enhance-cornelius-nc-homes` | `designer-shingles.html` | `/designer-shingles` | **301**; article has no new equivalent. |
| `/understanding-skylight-installation-services-in-denver-nc` | `skylights.html` | `/skylights` | **301**; article has no new equivalent. |
| `/brava-slate-roofing-tile` | `brava-slate-roofing-tile/index.html` | `/brava-slate-roofing-tile` | **Serve in place** (materials page). |
| `/brava-spanish-roofing-tile` | `brava-spanish-roofing-tile/index.html` | `/brava-spanish-roofing-tile` | **Serve in place** (materials page). |
| `/brava-cedar-shake-roofing-tile` | `brava-cedar-shake-roofing-tile/index.html` | `/brava-cedar-shake-roofing-tile` | **Serve in place** (materials page). |
| `/reliable-gutter-repair-solutions-in-concord-nc` | `gutters.html` | `/gutters` | **301**; article has no new equivalent. |
| `/comprehensive-new-construction-roofing-in-davidson-nc` | `new-construction.html` | `/new-construction-roofing` | **301**; article has no new equivalent. |
| `/complete-gutter-installation-services-in-mooresville-nc` | `gutters.html` | `/gutters` | **301**; article has no new equivalent. |
| `/expert-roof-repair-solutions-in-huntersville-nc` | `repair.html` | `/roof-repair-and-replacement` | **301**; article has no new equivalent. |
| `/how-metal-roofing-protects-homes-in-cornelius-nc` | `metal.html` | `/metal-roofing` | **301**; article has no new equivalent. |
| `/professional-roof-replacement-services-in-denver-nc` | `repair.html` | `/roof-repair-and-replacement` | **301**; article has no new equivalent. |
| `/velux-products` | `velux.html` | `/velux-products` | Preserve; live nav URL and new equivalent. |
| `/financing` | `financing.html` | `/financing` | New page; no old live sitemap URL found. |
| `/storm-damage-insurance-claims` | `storm-damage-insurance-claims.html` | `/storm-damage-insurance-claims` | New page; no old live sitemap URL found. |

## Must-cover 301 set

Before launch, configure and test these redirects because the old URL does not have an equivalent new URL at the same path: `/about-us`, all six `/service-area/*` URLs, `/resources`, the seven dated content/article URLs, all three BRAVA tile URLs, and the six additional gutter/new-construction/repair/metal article URLs listed above. The service, contact, and area-index URLs that retain their existing clean paths must instead be served in place; do **not** point `/services` to `/services`, for example.

If App Builder serves literal filenames rather than clean routes, every indexed service, area, and contact row above must be an actual 301 from the old clean URL to its `.html` mock file; otherwise use rewrites and serve the preserved clean path in place. Prefer rewrites plus clean URLs for SEO.

## No-new-equivalent decisions

- City landing pages: redirect each city URL to `/areas-we-serve`, not just the homepage.
- Resource/article URLs: redirect to the closest service page so intent is retained.
- BRAVA product URLs: redirect to `/designer-shingles`.
- The old resource index: redirect `/resources` to `/faq`, which is the new FAQ / Resources page.
- Keep query strings during redirects unless a parameter is known to be tracking-only.
- Use one hop only: old URL → final canonical URL. Avoid chains and never redirect a URL to itself.

## Canonical host

The current live behavior is `https://cprhomepros.com/` → `https://www.cprhomepros.com/` (301), while the `www` homepage returns 200. For the new deployment, keep the selected host consistent across DNS, App Builder, canonical tags, sitemap, redirects, Search Console, and GBP. Recommended canonical is **`https://cprhomepros.com` (apex)**; if App Builder only supports `www`, use `https://www.cprhomepros.com` consistently instead and make the other host a single 301 hop. No DNS change was made as part of this work.

## Crawl findings / broken or unknown URLs

- `https://www.cprhomepros.com/bathroom-remodels` — 404; linked from the live `/services` page but not in the sitemap. No new equivalent; remove the stale link and optionally 301 to `/services`.
- `https://www.cprhomepros.com/handyman-services` — 404; linked from the live `/services` page but not in the sitemap. Remove the stale link and optionally 301 to `/services`.
- `https://www.cprhomepros.com/painting_drywall` — 404; linked from the live `/services` page but not in the sitemap. Remove the stale link and optionally 301 to `/services`.
- Common-path probes `/index.html`, `/contact`, `/about`, `/service-area`, `/service-areas`, `/blog`, `/privacy-policy`, and `/terms-of-service` returned 404. They were not in the current sitemap; only add redirects if Search Console, analytics, or backlink data shows they were previously live/indexed. Sensible defensive targets are `/`, `/contact-us`, `/about`, `/areas-we-serve`, `/areas-we-serve`, `/faq`, and `/` respectively.
- `/sitemap.xml`, `/robots.txt`, and `/favicon.ico` returned 200 via curl. One WebFetch attempt reported a transient 500 for `sitemap.xml`; curl retrieved the XML successfully, so verify it again after cutover.
