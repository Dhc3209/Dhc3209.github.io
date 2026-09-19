# CPR Website Redesign Notes (internal)
**Path:** `/workspace/cpr-redesign/`  
**Preview:** `cd /workspace/cpr-redesign && python3 -m http.server 8765` → http://127.0.0.1:8765/  
**Vendor email:** none — this package is a static redesign mock only.

## Display vs legal
- Display: **Campbells Precision Roofing**
- Legal footer: **Campbell's Precision Roofing LLC**
- Phone: (704) 280-5996 · Email: Daniel@cprhomepros.com
- NAP: Denver, NC 28037 + phone/email only (street address held)

## Every-page chrome
1. Dual-path hero: locked H1 + sub + Storm CTA + Estimate CTA + large tap-to-call phone  
2. Trust row: GAF Master Elite · President’s Club · FORTIFIED · BBB A+ · Google rating  
3. Sticky mobile click-to-call bar  
4. Nav (one row desktop): Home | About | Services ▾ | Portfolio | Areas | Reviews | Contact | phone | estimate CTA  
5. Services ▾ includes Storm Damage / Insurance  
6. Footer: LLC, license #101889, COI, BBB A+, GAF Master Elite, FORTIFIED + Golden Pledge explainers, VELUX; CPR logo larger than badge placeholders  
7. FAQ/Resources footer only — no Home Additions in nav

## New / critical pages
- `storm-damage-insurance-claims.html` — first 48 hours, inspect/document, meet adjuster, matching/discontinued, NC R908 two-layer, storm vs code upgrades, CTAs; compliant language only  
- Homepage 3-field form (Name, Phone, City/ZIP) + optional photo; notifies Daniel@cprhomepros.com on publish  
- Reviews: Google widget placeholder (rating + count) — no invented quotes, no Trustindex  
- Areas: all 10 cities + 6 counties; optional Denver HOA list without job claims  
- Financing: “Financing available — ask at inspection” + military / GAF $250 rebate only

## Credentials / products (locked)
GAF Master Elite, President’s Club, FORTIFIED Roof, VELUX · GAF ID 1114013 · NC #101889 · BBB A+ since 2016 · Founded 2016 by Daniel H. Campbell III  
Products: Timberline HDZ, Grand Sequoia, Royal Sovereign; metal; gutters; VELUX  
Hours: Mon–Fri 8:00 AM–5:00 PM; storm call/text; never Open 24 Hours  
Instagram: cpr2643 only

## Gaps needing Daniel
1. Confirm street address (Echo Cove vs Campground) before publishing NAP  
2. Google Business / reviews widget embed code (rating + count)  
3. Approved project / hero / crew photos (no stock ladder shots)  
4. Official badge artwork (GAF, BBB, VELUX, FORTIFIED)  
5. Optional: Facebook / Google Business URLs

## File inventory
See `COPY-BLOCKS.md` for paste-ready copy. All `.html` pages are cross-linked with relative paths.

## Screenshots (generated)
- `/workspace/cpr-homepage.png` — homepage desktop
- `/workspace/cpr-storm-page.png` — storm/insurance page desktop
- `/workspace/cpr-areas-page.png` — areas page desktop
- `/workspace/cpr-homepage-mobile.png` — homepage mobile (sticky call bar visible)

## Preview
```bash
cd /workspace/cpr-redesign && python3 -m http.server 8765
# open http://127.0.0.1:8765/
```
Relative links work if opening HTML files directly as well.
