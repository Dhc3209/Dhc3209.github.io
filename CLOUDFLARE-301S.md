# Cloudflare HTTP 301 redirect rules — CPR (cprhomepros.com)

**Status:** Docs only — Cloudflare is **not** connected to App Builder / this deploy.  
GitHub Pages meta-refresh stubs (200 + refresh + `noindex`) are interim. Prefer edge **HTTP 301** when Cloudflare fronts the apex.

**Rules for Marketing:** Paste as Cloudflare **Redirect Rules** (or Page Rules). One hop. Apex final URL with trailing slash. Do **not** 301 a preserve-in-place URL to itself.

When live: remove or leave GH stubs harmless (edge 301 wins before origin).

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

## Interim (GitHub Pages today)

Meta-refresh stubs already ship at the From paths above (and `/about.html`). They return **200** + refresh — **not** equity-equivalent to HTTP 301. Replace with Cloudflare edge 301s when CF is on the domain.

Shipped: 2026-09-21 · Source: `SHIP-TOWN-PAGES-2026-09-21.md` + WEEK-PACK §C2
