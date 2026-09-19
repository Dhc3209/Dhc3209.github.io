# Campbells Precision Roofing — Website Staging

Static staging build of the CPR redesign mock. **Do not change DNS for cprhomepros.com** from this repo; Townsquare stays live until cutover.

## Display

- Business: Campbells Precision Roofing
- Email: Daniel@cprhomepros.com
- Phone: (704) 280-5996

## Pretty paths (Vercel rewrites)

| URL | File |
|---|---|
| `/` | `index.html` |
| `/about-us` | `about.html` |
| `/contact-us` | `contact.html` |
| `/areas-we-serve` | `areas.html` |
| `/services` | `services.html` |
| `/roofing` | `roofing.html` |
| `/roof-repair-and-replacement` | `repair.html` |
| `/new-construction-roofing` | `new-construction.html` |
| `/commercial-roofing` | `commercial.html` |
| `/metal-roofing` | `metal.html` |
| `/designer-shingles` | `designer-shingles.html` |
| `/gutters` | `gutters.html` |
| `/skylights` | `skylights.html` |
| `/portfolio` | `portfolio.html` |
| `/reviews` | `reviews.html` |
| `/faq` | `faq.html` |
| `/velux-products` | `velux.html` |
| `/financing` | `financing.html` |
| `/storm-damage-insurance-claims` | `storm-damage-insurance-claims.html` |

Legacy article / city / BRAVA URLs 301 via `vercel.json` (see `REDIRECT-MAP.md`). Optional short `/about` → `/about-us`.

## Forms (FormSubmit.co)

Homepage and contact forms POST to `https://formsubmit.co/Daniel@cprhomepros.com` with `_subject`, Name, Phone, City/ZIP, message (plus optional attachment / service on contact).

**First submit:** FormSubmit may email Daniel a confirmation link before delivering leads. Confirm once, then submissions flow normally. No API keys are stored in this repo.

## Staging SEO

- `robots.txt` Disallow: /
- `meta robots noindex,nofollow` on pages
- `X-Robots-Tag: noindex, nofollow` header

## Deploy

```bash
npx vercel --yes --prod
```

Or connect this private GitHub repo to Vercel / Cloudflare Pages / GitHub Pages.

## Cutover

See `CUTOVER-CHECKLIST.md` and `REDIRECT-MAP.md`. Do not cancel Townsquare until DNS cutover is complete and tested.
