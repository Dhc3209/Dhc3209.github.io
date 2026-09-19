# CPR Home Pros Hosting Cutover Checklist

For Daniel — move from Townsquare hosting without losing search traffic, calls, or leads.

## 1. Staging / pre-launch

- [ ] Put the new `/workspace/cpr-redesign/` build on a staging URL; keep it `noindex` until launch.
- [ ] Test every HTML page, mobile layout, logo/assets, click-to-call number `(704) 280-5996`, mailto link, contact form delivery, hours, address, reviews, and social links.
- [ ] Test the complete redirect map from `REDIRECT-MAP.md`; confirm one-hop 301s and no loops, 404s, or mixed-content errors.
- [ ] Confirm clean routes work even though the mock files end in `.html`; use App Builder rewrites/routes where supported.
- [ ] Add canonical tags, `robots.txt`, `sitemap.xml`, analytics/Search Console verification, and a useful 404 page. Keep staging out of the index.
- [ ] Confirm the new site contains the correct business name, service area, phone, email, and GBP landing-page URL.

## 2. Redirects

- [ ] Load every old sitemap URL and each indexed service, area, contact, article, and BRAVA URL from the redirect map.
- [ ] Verify changed URLs return HTTP 301 directly to the final clean URL; preserve query strings and avoid redirect chains.
- [ ] Verify preserved paths (services, core service pages, contact, areas index, reviews, portfolio, FAQ) serve the new page at the same URL rather than self-redirecting.
- [ ] Remove or fix the three stale links found on live `/services`: `/bathroom-remodels`, `/handyman-services`, and `/painting_drywall`.
- [ ] Submit the final sitemap in Google Search Console and inspect representative old URLs and new URLs after launch.

## 3. Google Business Profile (GBP)

- [ ] After the new site is live and reachable on the canonical host, update GBP website URL to `https://cprhomepros.com/` (recommended canonical).
- [ ] Check the GBP call number, service links, photos, service area, hours, and appointment/contact link.
- [ ] Do not change business name, address, or categories as part of a website-hosting cutover unless separately verified.

## 4. DNS / launch

- [ ] Confirm which host App Builder supports. Recommended: apex `https://cprhomepros.com`; make `www` a single 301 to apex. If App Builder requires `www`, reverse that consistently.
- [ ] Confirm SSL certificates for both apex and `www`, HTTPS-only behavior, and that the canonical host is used in redirects, tags, sitemap, GBP, and Search Console.
- [ ] Coordinate the DNS change with the authorized domain/DNS administrator. No DNS change is made by this checklist.
- [ ] Immediately after DNS propagation, test homepage, all new pages, forms, phone links, sitemap, robots, canonical host, redirects, and 404 behavior from an external connection.
- [ ] Monitor calls, form submissions, traffic, Search Console coverage, and server logs for at least 7–14 days.

## 5. Cancel Townsquare last

- [ ] Keep Townsquare active until DNS is stable, the new site is receiving leads, and the old URL test set returns the expected 301s.
- [ ] Export or preserve any Townsquare analytics, form leads, image assets, SEO metadata, and account/domain details needed for records.
- [ ] Confirm the domain registration, DNS control, phone number, email, and GBP ownership are not being canceled with the hosting plan.
- [ ] Only then cancel Townsquare hosting and obtain written confirmation of the cancellation date and final billing.
