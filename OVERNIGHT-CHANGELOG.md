# Overnight changelog — Campbells Precision Roofing (staging)

**Live staging:** https://dhc3209.github.io/  
**Source of truth:** `Dhc3209/cprhomepros-website-staging` → synced to `Dhc3209/Dhc3209.github.io`  
**For:** Daniel (morning) · App Builder (Website Launch post)  
**When:** Sat night → Sun morning, Sep 19–20, 2026 (America/New_York)

## Shipped (paste for Website Launch)

1. **Nav cleanup** — Removed Velux + Resources (+ FAQ) from the top bar; Services dropdown curated so GAF roofing & storm help lead; Brava SKUs no longer fight for primary attention.
2. **Anti-scam posture held** — Storm page and sitewide “no deductible waivers / work with *your* adjuster” language kept; no waiver or “insurance pays all” copy added.
3. **Page titles that match the page** — Replaced the repeated generic H1 on Contact, Reviews, Portfolio, FAQ, and Areas with specific headlines.
4. **Homepage voice** — Replaced the brochure “transforming roofing challenges…” line with straight Master Elite / local-crew copy (Campbells display spelling).
5. **Contact & Quick Estimate** — Removed “Roofle-style” wording; softened lead-gate microcopy while keeping “preliminary only / not an insurance quote / no deductible waivers.”
6. **Gutters** — Primary CTA now asks for a gutter inspection, not a roof estimate.
7. **Proof polish** — Areas image alts fixed; Reviews page given a clearer 5.0 / 151 path to Google (no fake reviews). Location/NAP left unchanged per your instruction.

## Also done overnight

- Dual Storm vs Estimate CTAs + phone **(704) 280-5996** kept visible (no sticky Call Now bar).
- GAF-first hierarchy preserved (CertainTeed / Brava / VELUX secondary).
- Quick Estimate honesty rules kept (contact before $, approx squares, Chief rates).
- Mobile menu: Esc / outside-click close, `aria-expanded`, scroll lock, taller usable panel.
- Performance: compressed oversized job photos where safe; lazy-load retained.
- Campground Rd NAP untouched. No DNS / CNAME changes.

## Smoke-test before cutover talk

- [ ] Open https://dhc3209.github.io/ on phone — menu, Services accordion, dual CTAs
- [ ] Quick Estimate 4 steps + disclaimer still honest
- [ ] `/gutters/` primary = gutter inspection
- [ ] `/contact-us/`, `/reviews/`, `/portfolio/`, `/faq/`, `/areas-we-serve/` H1s page-specific
- [ ] Footer still shows Campground Rd + licenses

## 2026-09-22 evening — Lake Norman town SEO pack

- **NEW** `/service-area/mooresville-nc/` — replaced meta-refresh stub with full town page (Section A)
- **NEW** `/service-area/sherrills-ford-nc/` — full town page (Section B; double-L spelling)
- Areas We Serve: Mooresville card → town URL; added Sherrills Ford card; intro town list
- Homepage: Mooresville → town URL; Sherrills Ford mention+link; closing CTA towns line
- Sitemap: both town URLs
- Cornelius + Huntersville: title/meta/og + local differentiator + nearby links to Mooresville/Sherrills
- Denver nearby: Mooresville + Sherrills Ford links
- CLOUDFLARE-301S / REDIRECT-MAP: do **not** 301 mooresville-nc → Areas once live
