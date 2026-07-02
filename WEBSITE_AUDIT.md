# Lunde Flooring — Complete Website Audit

*Generated 2026-07-02 by a seven-dimension review of every page, the checkout, the staff console, the server, and the live site.*

**How to read this:** every item says what is wrong, why it matters, and what to do. `Impact` is how much it moves the business; `Effort` is roughly how much work it is. Items marked ✅ were fixed today during the audit itself.

## Start Here — The Top Priorities

These are every high-impact finding across all seven areas, cheapest first:

1. **Phone number is missing from the site header and footer** — *Quick win, Selling More*
2. **Product page claims a 'Lifetime warranty' the warranty page contradicts** — *Quick win, Selling More*
3. **LocalBusiness schema is missing the core local-pack signals: address, hours, geo, and Google Business Profile link** — *Quick win, Getting Found*
4. **Open Graph tags are injected client-side, so shared links show no image on Facebook, iMessage, WhatsApp, or Slack** — *Quick win, Getting Found*
5. **JS/CSS ship with 'no-cache' on the live site, so every visitor re-downloads everything on every page view** ✅ **(fixed today)** — *Quick win, Speed*
6. **Keyboard users tab onto invisible 'Save' and 'Compare' buttons on every product card** — *Quick win, Accessibility*
7. **'Added to cart' toasts are never announced to screen readers** — *Quick win, Accessibility*
8. **Entire server source code and deploy notes are downloadable from the live site** ✅ **(fixed today)** — *Quick win, Security & Robustness*
9. **No security response headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)** — *Quick win, Security & Robustness*
10. **Replies to order emails bounce — no inbound mail for the from-address domain** — *Quick win, Data Reliability & Operations*
11. **After 'Add to cart' on a phone, the 'View cart' button does nothing and the cart is hard to reach** — *Quick win, Mobile Experience*
12. **Two contradictory sample flows: marketing says free, product page charges $2.99** — *Moderate, Selling More*
13. **No abandoned-checkout recovery despite capturing email before payment** — *Moderate, Selling More*
14. **Zero social proof anywhere in the purchase funnel** — *Moderate, Selling More*
15. **Catalog page eagerly loads all 67 product photos (~3MB) as CSS background-images with no lazy loading** — *Moderate, Speed*
16. **Header/nav is injected by deferred JS, causing a layout shift on every storefront page (CLS)** — *Moderate, Speed*
17. **Product page hero image (its LCP) is a full-resolution webp set by JS, delayed behind a 4-script chain** — *Moderate, Speed*
18. **Mobile menu is a keyboard/screen-reader trap-free overlay — focus never enters it and the page behind stays tabbable** — *Moderate, Accessibility*
19. **Customers see fabricated stock numbers — real inventory never reaches the storefront** — *Moderate, Data Reliability & Operations*
20. **Staff price/product edits never reach customers or Stripe — two catalogs of truth** — *Moderate, Data Reliability & Operations*
21. **Orders can be lost on restart: Supabase writes are fire-and-forget with no retry** — *Moderate, Data Reliability & Operations*
22. **Staff console writes fail silently and get reverted — no error surfacing or retry** — *Moderate, Data Reliability & Operations*
23. **No real backup or data export — one Supabase row per store, last-write-wins, no history** — *Moderate, Data Reliability & Operations*
24. **Staff Inventory, Products and Customers tables are unusable on a phone** — *Moderate, Mobile Experience*

## Selling More (Conversion & Shopping Experience)

### Phone number is missing from the site header and footer
**Impact: High · Effort: Quick win**

(661) 444-2857 appears only on contact.html and warranty.html; the shared header/footer built by chrome.js has no tel: link at all. This is a local Bakersfield retailer selling considered $1,500+ purchases — a large share of buyers want to talk to a human before ordering, and right now they have to hunt for the Contact page to find a number. Add a click-to-call phone link to the chrome.js top bar or header and to the footer brand block; it is also a strong trust signal that a real local business is behind the site.

### Product page claims a 'Lifetime warranty' the warranty page contradicts
**Impact: High · Effort: Quick win**

product.js hardcodes 'Lifetime warranty' in the buy-box assurance strip (line 155) and 'Lifetime residential' in the spec table (line 80), while index.html, faq.html, and warranty.html all state 20-year limited residential coverage. Overstating warranty terms at the point of sale is both a trust breaker when the buyer clicks through to warranty.html and a real legal exposure on a written product claim. Change both strings in product.js to '20-year residential warranty' (or read the term from product specs).

### Two contradictory sample flows: marketing says free, product page charges $2.99
**Impact: High · Effort: Moderate**

The homepage, top bar, and samples.html all promise 'free samples, no card required' (4-swatch box, POSTs to /api/samples), but the product page buy box (product.js line 150) sells samples at money(product.samplePrice) — $2.99 each in data.js — pushing them through cart and Stripe checkout, and cart.js line 27 shows '$2.99 each · ships free'. A shopper who just read 'Get 4 free samples, delivered' and then sees a $2.99 charge on the very floor they want will distrust every other price on the site. Unify on one flow: make the PDP 'Order a sample' button add the product to the samples-selection localStorage key used by samples.js and deep-link to samples.html, and remove paid samples from cart/checkout entirely.

### No abandoned-checkout recovery despite capturing email before payment
**Impact: High · Effort: Moderate**

checkout.js creates the full order (with the customer's email) and stores it as status 'placed' / payment 'awaiting_payment' before redirecting to Stripe, but server.js configures no Stripe session recovery (no after_expiration) and nothing ever emails the customer if they bail at the payment step — the order just sits in the staff console as awaiting_payment. For $1,200+ carton orders this is the single cheapest revenue lever available: add a Resend follow-up email (the address is already on the order) with a link that restores the cart, and enable Stripe Checkout's after_expiration.recovery URL in the checkout-session handler in server.js.

### Zero social proof anywhere in the purchase funnel
**Impact: High · Effort: Moderate**

index.html, catalog, and the product page contain no customer reviews, star ratings, Google review count, testimonials, or customer install photos — the only 'trust' content is self-asserted (warranty, waterproof, free delivery). For a small unknown retailer competing with Home Depot and LL Flooring, third-party proof is the biggest missing conversion element. Add a review/testimonial band on index.html (Google reviews with a link to the profile is enough to start) and a short 'what Bakersfield customers say' strip on product.html near the buy box.

### Buy box says 'Ships in 2 days' even on backordered floors, and stock is never enforced
**Impact: Medium · Effort: Quick win**

product.js line 153 hardcodes 'Ships in 2 days' in the pdp-assure-mini strip, directly below a status pill that can read 'Backordered — ships in 2–3 weeks' (store.js stockInfo). The same buy box contradicting itself kills credibility, and addCart never caps cartons at available stock, so a customer can buy 40 cartons of a floor with 3 left and expect them in 2 days. Make the assurance line render stock.text (or hide it when level is 'out'), and warn or cap in addCart when requested cartons exceed stockInfo(product.id).cartons.

### No 'you're $X away from free delivery' nudge in cart or drawer
**Impact: Medium · Effort: Quick win**

Free local delivery over $1,200 is the site's most-repeated offer (top bar, homepage trust bar, PDP, cart note), yet cart.js and the store.js cart drawer only show a static footnote — a shopper at $1,050 is never told that one more carton makes delivery free. A dynamic progress line ('Add $150 more for free delivery') in the cart summary and drawer totals is a proven basket-builder and trivially computable from cartTotals() and siteSettings().freeShipOver, ideally paired with a one-click 'add a carton' upsell.

### Checkout accepts any US address with no service-area or ZIP validation
**Impact: Medium · Effort: Moderate**

checkout.html/checkout.js let anyone enter any street/city/state (state is a free-text input) and quotes flat $149 freight, while the business only delivers across Kern County per every marketing page. An out-of-area customer can pay for an order the shop then has to refund, and a local customer gets no confirmation they qualify. Validate the ZIP against a Kern County service list at checkout (mirroring areas-we-serve.html), show a clear 'we deliver to your area' confirmation, and route out-of-area ZIPs to a contact/quote path instead of Stripe.

### Catalog wastes filter space on a dead 'Type' dropdown and loses filter state on back-navigation
**Impact: Low · Effort: Quick win**

In catalog.js, floorType() returns the constant 'Crafted Luxury Vinyl Plank', so the Type select always contains exactly one real option — a dead control occupying prime filter-bar space on catalog.html. Meanwhile only the search query is persisted to the URL; tone/series/sort choices reset when a shopper opens a product and hits Back, forcing them to re-filter mid-browse. Remove the Type select (or replace it with a useful facet like thickness/wear layer) and write filter state to URLSearchParams so back/forward and shared links preserve it.

## Getting Found (SEO & Local Search)

### LocalBusiness schema is missing the core local-pack signals: address, hours, geo, and Google Business Profile link
**Impact: High · Effort: Quick win**

The sitewide LocalBusiness JSON-LD in seo.js declares only city-level address (addressLocality: Bakersfield), no streetAddress/postalCode, no openingHoursSpecification (even though contact.html displays hours), no geo coordinates, and sameAs lists only Instagram. For a query like 'flooring Bakersfield', Google leans heavily on a complete, GBP-consistent NAP. Add streetAddress + ZIP (or, if operating without a public storefront, model it as an explicit service-area business with a serviceArea GeoCircle), add openingHoursSpecification matching contact.html, add geo lat/long, and add the Google Business Profile / Maps URL to sameAs. Also put the phone number (661) 444-2857 and hours in the chrome.js footer so NAP is visible on every page, not just contact.html and warranty.html.

### Open Graph tags are injected client-side, so shared links show no image on Facebook, iMessage, WhatsApp, or Slack
**Impact: High · Effort: Quick win**

seo.js injects og:image, twitter:card, and canonical via JavaScript, but social/link-preview scrapers do not execute JS. Verified live: curl of https://lundeflooring.com/samples.html returns zero og: tags in the raw HTML. No public page has a static og:image at all — index.html, catalog.html, etc. hand-author og:title/og:description but omit og:image; samples.html, faq.html, warranty.html, and shipping-returns.html have no static OG tags whatsoever. Every share of the site (the exact word-of-mouth channel a local retailer lives on) renders as a bare gray link. Bake full static OG blocks (including og:image and og:url) into every public page head, keeping seo.js as a fallback only.

### FAQ page has rich Q&A content but emits no FAQPage structured data
**Impact: Medium · Effort: Quick win**

faq.html contains roughly 30 well-written question/answer pairs in <details> elements, and seo.js already has a ready-made hook — it emits FAQPage JSON-LD from a data-faq attribute on <body> — but faq.html never sets it (only areas-we-serve.html uses the sibling data-breadcrumb hook). This is a built feature left unplugged: adding the data-faq attribute (or generating the JSON-LD from the existing <details> markup) makes the page eligible for FAQ rich results and feeds answer-engine/AI-search citations for questions like 'is LVP waterproof'.

### Product and catalog images are CSS backgrounds, invisible to Google Images and screen readers
**Impact: Medium · Effort: Moderate**

Every product swatch and PDP gallery image is rendered as a background-image on a <span>/<div> (catalog.js line 97, product.js lines 113-119, 172, 226), so none of the 67 floors' photos are crawlable image content with alt text — the catalog.html and product.html DOM contain zero <img> product shots. Flooring is bought by eye; 'greige vinyl plank flooring' image-search traffic and Google Shopping-style image surfaces are handed to competitors. Convert the PDP main gallery and catalog card swatches to real <img> elements with descriptive alts like 'Soft Linen Oak waterproof LVP — Greige, Grove Series' (object-fit: cover reproduces the current look).

### No indexable category or collection pages — the catalog is a single URL
**Impact: Medium · Effort: Moderate**

All catalog filtering (collection, color, tone) happens client-side on catalog.html with no crawlable filtered URLs; the sitemap contains only catalog.html plus 67 product URLs, and seo.js's canonical logic even whitelists a ?category= param that nothing generates. Mid-funnel queries like 'greige LVP flooring', 'wide plank vinyl Bakersfield', or 'Grove Series flooring' have no landing page to rank. Add server-recognized collection/color landing URLs (even simple pre-filtered views of catalog.html with server-injected unique title/description, mirroring the injectProductMeta pattern in server.js), list them in the sitemap, and link them from the catalog page and footer.

### Product JSON-LD is missing the fields Google now expects for merchant listing rich results
**Impact: Medium · Effort: Moderate**

injectProductMeta in server.js (lines 1585-1628) emits solid Product/Offer markup, but the Offer lacks shippingDetails and hasMerchantReturnPolicy — both of which Search Console flags and which gate the full merchant-listing treatment (price, shipping, returns shown in results) — and there is no aggregateRating because the site collects no reviews. Add OfferShippingDetails (free local delivery over $1,200, $149 freight — already stated on shipping-returns.html) and MerchantReturnPolicy to the generated JSON-LD, and start collecting post-delivery reviews via the existing Resend order emails to eventually populate ratings.

### Areas We Serve is one thin page trying to rank for 15 cities
**Impact: Medium · Effort: Big project**

areas-we-serve.html gives each Kern County community only 1-2 generic sentences inside a card grid, which will not rank for '[city] flooring' or 'vinyl plank Delano' searches — the cheapest local keywords a Bakersfield retailer can own. Build dedicated city landing pages for the top 4-6 delivery areas (e.g. /flooring-tehachapi.html) with unique content: delivery specifics, popular floors for that housing stock, a local FAQ, and LocalBusiness/Service schema; add them to SEO_STATIC_PAGES in server.js so they enter the sitemap, and interlink them from areas-we-serve.html and the footer.

### Product meta descriptions and on-page copy are one template rotated across 67 floors
**Impact: Low · Effort: Moderate**

The server-injected meta description (server.js line 1588) is the identical sentence for all 67 products with only name/collection/price swapped, and PDP body copy comes from just 4 rotating templates in data.js buildDescription — so dozens of pages read near-identically to Google and to shoppers comparing floors. Differentiate the highest-traffic floors first: fold each product's real specs (thickness, wear layer, pad, plank size — already in data.js specs) into its meta description and description paragraph so each page states something checkable and unique, e.g. '8 mm rigid core, 20 mil wear layer, 1.5 mm attached pad'.

## Speed (Performance)

### JS/CSS ship with 'no-cache' on the live site, so every visitor re-downloads everything on every page view ✅ *(fixed today)*
**Impact: High · Effort: Quick win**

Live headers on lundeflooring.com show cache-control: no-cache for v6.css, data.js, store.js, chrome.js and every other script/stylesheet, and Hostinger's CDN reports x-hcdn-cache-status: MISS on every request — so nothing is cached in the browser or at the edge. Each storefront navigation re-fetches ~7 text assets (~60-70KB brotli plus 7 origin round-trips), which is why moving between catalog, product, and cart pages feels slower than it should. The working branch (server.js line ~1419) already adds 'public, max-age=60, stale-while-revalidate=600' for .js/.css but it is NOT on origin/main / deployed. Deploy that fix, and go further: append a version query (?v=<mtime hash>) to script/link URLs and serve them with max-age=31536000, immutable, matching what media files already get.

### Catalog page eagerly loads all 67 product photos (~3MB) as CSS background-images with no lazy loading
**Impact: High · Effort: Moderate**

catalog.js card() (line ~97) renders every product image as an inline style background-image using the .md.webp variant (avg 55KB, up to 123KB, 600px wide), and render() dumps all 67 cards at once — roughly 3MB of images fetched immediately, even on a phone where only 2-4 cards are visible. Background-images cannot use loading="lazy", srcset, or fetchpriority. Switch cards to real <img loading="lazy" src="...thumb.webp" srcset="...thumb.webp 300w, ...md.webp 600w"> — the .thumb.webp variants already exist (avg 6.4KB) but 18 of 67 products are missing one, so generate the missing thumbs. This is the single biggest bandwidth cut on the most important shopping page.

### Header/nav is injected by deferred JS, causing a layout shift on every storefront page (CLS)
**Impact: High · Effort: Moderate**

chrome.js (line 73) runs as a deferred script and does document.body.insertAdjacentHTML("afterbegin", topbar + header) — the page paints without the ~100px announcement bar + header, then everything jumps down when JS executes. That is a guaranteed Cumulative Layout Shift hit on every page, which hurts both perceived quality and Google's Core Web Vitals ranking signal for a local-SEO-dependent business. Fix by reserving the space (e.g. body { padding-top: var(--header-h) } set in v6.css) or by inlining a static header placeholder in each page's HTML that chrome.js hydrates instead of prepends.

### Product page hero image (its LCP) is a full-resolution webp set by JS, delayed behind a 4-script chain
**Impact: High · Effort: Moderate**

product.js line 117 sets the main PDP image via background-image using gallery[0].url — the FULL-size .webp (many are 270-330KB), not the .md variant — and it can't even start downloading until chrome.js + data.js (124KB) + store.js (79KB) + product.js have all executed. That makes the Largest Contentful Paint on every product page slow and un-optimizable by the browser. server.js already rewrites product.html's <head> per slug (injectProductMeta, line 1585) — have it also inject <link rel="preload" as="image"> for the .md variant of the main image, and change product.js to use L.img() (the .md rewriter it already uses elsewhere) plus a real <img fetchpriority="high"> for the main gallery image.

### Google Fonts loaded via @import inside v6.css adds a render-blocking request chain
**Impact: Medium · Effort: Quick win**

v6.css line 5 uses @import url(fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800) — the browser must download and parse the 102KB v6.css before it even discovers the fonts stylesheet, then fetch the CSS, then the woff2 files, serializing three round-trips before text settles. The preconnect hints in the HTML help but cannot fix the discovery delay. Quick fix: delete the @import and put a <link rel="stylesheet" href="https://fonts.googleapis.com/..."> in every page <head> (a shared include pattern already exists via chrome.js pages). Better: self-host Inter as two or three woff2 files with font-display:swap and preload the body weight — also trims the 5 loaded weights, several of which are barely used.

### Homepage 'best sellers' grid loads 8 below-the-fold card images eagerly and only after the full JS chain
**Impact: Medium · Effort: Quick win**

index.html's inline script (line ~182) builds the featured grid on DOMContentLoaded using background-image styles, so 8 x ~55KB .md.webp images (~440KB) download eagerly even though the grid sits below the hero, and the cards pop in late because they wait on chrome.js + data.js + store.js. Since the homepage is the top entry page, render these as static HTML <img loading="lazy" srcset> at build/deploy time (the product list rarely changes), or at minimum switch the JS to emit <img loading="lazy"> instead of background-image.

### Every page — even FAQ, contact, and checkout — loads the full 124KB product database plus 79KB store.js
**Impact: Medium · Effort: Big project**

data.js (124KB: all 67 products with full descriptions, specs, and gallery lists) and store.js (79KB, which includes staff-console sync code like pullOrders/staffLogin/quotes that no shopper ever runs) are loaded on every storefront page, including content pages that show no products. Brotli shrinks the transfer (~36KB combined) but mobile phones still pay the parse/execute cost on every navigation, compounded by the no-cache issue above. Split store.js into a small storefront core (cart, favorites, img helper) and a staff module loaded only by console pages, and consider trimming data.js to summary fields with descriptions/galleries fetched on the product page.

### Several lifestyle photos ship at full size where responsive variants are missing or unused
**Impact: Low · Effort: Quick win**

media/lifestyle contains multiple 250-420KB webp files (living-room-light-oak.webp 421KB, oak-plank-overhead-detail.webp 333KB, living-room-sectional-oak.webp 330KB). Most pages correctly use -800/-1400 srcset variants, but the full-size original is still listed as the largest srcset candidate (e.g. install.html line 182 offers the 421KB file at 1400w alongside a 1400-wide variant), so large desktop screens download it. Audit the srcset lists to cap at the -1400 variant, and re-encode the handful of originals over 250KB at quality ~70 — nobody needs a 421KB hero on a flooring content page.

## Accessibility

### Keyboard users tab onto invisible 'Save' and 'Compare' buttons on every product card
**Impact: High · Effort: Quick win**

On desktop, .v6-card-fav (heart) and .v6-card-compare are opacity:0 and only revealed by .v6-card:hover (v6.css lines 193-194 and 491-492); there is no :focus-visible/:focus-within rule to reveal them, so a keyboard user tabbing through the catalog grid (catalog.html, rendered by catalog.js) lands on a fully invisible button on every card — WCAG 2.4.7 failure and deeply disorienting. Fix is two CSS rules in v6.css: .v6-card:focus-within .v6-card-fav / .v6-card-compare { opacity:1 } (mirroring the existing :has(:focus-visible) card-lift rule at line 1150). Also note .v6-card-sample styles are dead code — no JS generates that element.

### 'Added to cart' toasts are never announced to screen readers
**Impact: High · Effort: Quick win**

showToast() in store.js (line 1044) injects a plain <div class="toast"> with no role="status" or aria-live, then removes it after 3.2 seconds. Every cart add, sample add, and error confirmation on catalog, product, and samples pages is therefore silent for screen-reader users — they click 'Add to cart' and get zero feedback, the single most important e-commerce confirmation. Fix: add toast.setAttribute('role','status') (or a persistent aria-live="polite" container) in showToast; the checkout promo message #promoMessage (checkout.html line 65) needs the same role="status" the login/contact pages already have.

### Mobile menu is a keyboard/screen-reader trap-free overlay — focus never enters it and the page behind stays tabbable
**Impact: High · Effort: Moderate**

In chrome.js (setMenu, ~lines 122-143), opening the full-screen mobile menu (#v6MobileMenu) locks scroll but does not move focus into the menu, does not trap Tab inside it, and does not return focus to the burger on Escape; the burger also lacks aria-controls. A keyboard or screen-reader user on a phone (the primary nav below 860px) taps Menu and their focus stays on the page underneath the opaque overlay, tabbing through links they cannot see. Fix in chrome.js: on open, focus the first menu link, loop Tab within the menu, and restore focus to the burger on close; wrap the menu in a <nav> with aria-label.

### The main product photo on the PDP has no text alternative
**Impact: Medium · Effort: Quick win**

product.js renders the hero gallery image as a CSS background div (#pdpMainImg, line 117) and the compare-dialog product images the same way (catalog.js line 174) — screen readers perceive nothing where the primary product photo sits, on a site where the photo IS the product. Thumbnails and card links are labeled, so this is the one gap. Fix: give #pdpMainImg role="img" and aria-label set to the current gallery item's label (product title + view name), updated in the existing setThumb handler, and add aria-hidden="true" to the duplicate decorative swatch divs.

### No skip-to-content link on any page
**Impact: Medium · Effort: Quick win**

Every storefront page starts with the topbar, a 9-link header, and (injected by chrome.js) the mobile menu markup before reaching content; keyboard and switch users must tab through all of it on every single page, and there is no 'Skip to content' link anywhere (verified on index.html, catalog.html, product.html and the running site). Fix in chrome.js: prepend one visually-hidden-until-focused anchor (<a class="skip-link" href="#main">Skip to content</a>) and ensure each page's content wrapper has id="main" — one small change that fixes all pages at once, and matches the promises on your own accessibility.html page.

### The --faint text token (#858585) fails AA contrast where it carries real information — including order-tracking status steps
**Impact: Medium · Effort: Quick win**

--faint (#858585 on white, v6.css line 17) is roughly 3.7:1, below the 4.5:1 WCAG AA minimum, and it is used at 10.5-12.5px for content that matters: the order-status stepper labels on my-order.html (.mo-step, v6.css 894-895), account nav counts and dates (v6.css 641-710), and sample tone labels on samples.html (v6.css 1228). Low-vision customers checking 'where is my order' get the hardest-to-read text on the page. Fix: darken the token to #767676 (exactly 4.54:1) — a one-line change in :root that fixes every usage.

### prefers-reduced-motion coverage is partial — smooth scroll and large hover zooms ignore it
**Impact: Low · Effort: Quick win**

The site already gates .reveal, card lifts, and skeletons behind prefers-reduced-motion (good), but html { scroll-behavior: smooth } (v6.css line 38), the 1s image zooms on collection/room tiles (.v6-coll, .v6-room, lines 176/231), and the header hide/show transform are ungated, so motion-sensitive users still get animated scrolling and continuous scale transforms. Fix: one @media (prefers-reduced-motion: reduce) block in v6.css setting scroll-behavior:auto and disabling the tile transforms/header transition — finishes the job the codebase clearly already started.

### Closing the mobile menu or nav dropdown with Escape strands keyboard focus
**Impact: Low · Effort: Quick win**

In chrome.js the Escape handler (lines 166-172) restores focus to the Resources dropdown button but does nothing for the mobile menu — when Escape closes it, focus is left on a link inside a now display:none container, so the next Tab silently restarts from the top of the document. The burger's innerHTML swap on toggle (line 127) also recreates the icon mid-interaction. Fix: in setMenu(false), call burger.focus() when the close was keyboard-initiated; cheap and makes the menu feel native for keyboard users.

## Security & Robustness

### Entire server source code and deploy notes are downloadable from the live site ✅ *(fixed today)*
**Impact: High · Effort: Quick win**

GET https://lundeflooring.com/server.js returns the full 130KB backend source (verified 200), and store.js, data.js, loader.cjs, package.json, pnpm-lock.yaml, GO_LIVE.md, LAUNCH_CHECKLIST.md, AGENTS.md and the Supabase migration SQL are all served too. serveStatic() in server.js (line ~1360) only blocks dotfiles and /api/data/; every other repo file is public. This hands an attacker a map of every endpoint, the rate-limit thresholds, the Supabase project ref, and the ADMIN_RECOVERY env backdoor that mints an Owner account on boot. Add an explicit denylist (or allowlist) so only intended public assets — .html, .css, client .js, /media — are served, and 404 everything else including *.md, package files, and server-side .js/.cjs.

### No security response headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
**Impact: High · Effort: Quick win**

Live responses for both pages and APIs carry only 'content-security-policy: upgrade-insecure-requests' and nothing else (verified on /catalog.html and /api/settings). The Node server never sets X-Frame-Options/frame-ancestors, so the staff console (dashboard.html, orders.html, settings.html) can be framed for clickjacking; there is no HSTS, no X-Content-Type-Options: nosniff, and no real Content-Security-Policy to blunt XSS. Add a shared header block in server.js writeHead paths: 'X-Frame-Options: DENY' (or CSP frame-ancestors 'none') on all HTML, 'X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'Strict-Transport-Security: max-age=31536000' in production, and a scoped CSP.

### Public /api/settings leaks all promo codes and pricing config to anyone ✅ *(fixed today)*
**Impact: Medium · Effort: Quick win**

The 'settings' GET handler (server.js line ~217) returns getSettings() to unauthenticated callers, and the live endpoint currently exposes the full promoCodes map (LUNDE10 = 10% off, SAMPLE5 = $5 off) plus tax rate and freight knobs (verified via curl). Any visitor can read or enumerate active discount codes and apply them, and new codes leak the moment staff save them. Strip promoCodes (and any non-public pricing internals) from the anonymous response and only include them for an authenticated staff session, the same way the email/integrations block is already gated.

> **Status:** Fixed today for the sensitive parts: the markup %, email settings, and integration details are now staff-only. Promo codes are still readable (the cart needs them to validate) — a determined visitor could list them, so avoid codes you would mind being found.

### Contact/feedback POST is unauthenticated, unthrottled, and stores arbitrary fields
**Impact: Medium · Effort: Quick win**

In handleListStore (server.js ~line 1279) the public feedback POST skips requireStaff but never calls rateLimit(), and it persists { createdAt, ...input } via upsertById with no cap on record count and no field whitelist. An attacker can flood the store to inflate Supabase/disk indefinitely (storage DoS), overwrite an existing entry by supplying a known id, and inject trusted-looking fields (e.g. source:'staff' to suppress the new-message alert, or forged status/replies/photos shown in the staff inbox). Add a per-IP rate limit like the samples endpoint already has, whitelist the accepted fields (name/email/phone/message/topic/page/photos), and server-generate the id/source instead of trusting input.

### ADMIN_RECOVERY env var silently re-creates an Owner on every boot
**Impact: Medium · Effort: Moderate**

recoverOwnerFromEnv() (server.js ~line 124) runs on each getAdminUsers() call: if the ADMIN_RECOVERY env value is set and differs from the stored key, it overwrites/creates an Owner account from ADMIN_EMAIL/ADMIN_PASSWORD, resetting that user's password. Because the full source is currently public, the existence and exact trigger of this backdoor are discoverable; anyone who can set or read hosting env vars (or a leaked .env) gets a permanent admin foothold that also bypasses the staff-console account controls. Gate this behind an explicit one-shot flag, log it as a security event (it already redacts the key), and remove/rotate ADMIN_RECOVERY from the running environment after use.

### Concurrent full-store read-modify-write can silently lose orders and inventory
**Impact: Medium · Effort: Big project**

Every mutation does readStore(name) -> mutate whole array/object -> writeStore(name, wholeValue) with no locking (e.g. handleOrders, applyInventoryDeduction, recordEmailStatus). Two overlapping requests — a Stripe webhook marking paid while staff PATCH a status, or two checkouts landing together — each read the same snapshot and the second write clobbers the first, dropping an order or mis-deducting cartons. With Supabase, writeStore is also fire-and-forget (persistSupabaseStore().catch logs and moves on), so a failed remote write leaves the in-memory cache ahead of the database and diverges across instances. Move order/inventory mutations to targeted row updates or a serialized write queue, and surface/persist-retry failed Supabase writes instead of only logging them.

## Data Reliability & Operations

### Replies to order emails bounce — no inbound mail for the from-address domain
**Impact: High · Effort: Quick win**

Every confirmation/delivery/quote email is sent from orders@lundeflooring.com and tells the customer to 'reply to this email and our team will help' (server.js lines ~1892, 2117, 2194), but lundeflooring.com has no MX record, so those replies bounce — customers think the shop is ignoring them. The emailReplyTo setting exists (server.js line ~1975) but defaults to empty. Fix today: set the Reply-to address in staff Settings to a monitored mailbox, then add MX/forwarding for orders@ (Hostinger email or a forwarder); also upgrade DMARC from p=none once verified.

### Customers see fabricated stock numbers — real inventory never reaches the storefront
**Impact: High · Effort: Moderate**

store.js (seedStockFor, line ~1003) invents a deterministic 350-750 carton count per SKU for any visitor whose browser has no cached inventory, and /api/inventory GET is staff-only (server.js line ~1306), so the public product page's 'In stock — ships in 2 business days' / 'Low stock — N cartons left' badges are pure fiction disconnected from the warehouse counts staff maintain in the console. A customer can pay for a floor that is actually at zero cartons, forcing refunds and apology calls. Fix: expose a public read-only inventory endpoint (or bake levels into the SEO catalog response) and have product.js/catalog.js render real levels — or stop showing specific carton counts entirely.

### Staff price/product edits never reach customers or Stripe — two catalogs of truth
**Impact: High · Effort: Moderate**

Product edits made in the console (product-edit.js -> PUT /api/products) are stored as overrides in the Supabase 'products' store, but the server's checkout pricing uses productsById() which parses only the static data.js file (server.js line ~1451), and the public storefront never pulls overrides because GET /api/products requires staff auth. So the owner can 'change a price' in the console, see it change on their own screen, and customers still see and pay the old data.js price. Fix: merge the products store over data.js in computeOrderTotals() and loadPublicCatalog(), and serve overrides publicly — or remove the product editor until it does something real.

### Orders can be lost on restart: Supabase writes are fire-and-forget with no retry
**Impact: High · Effort: Moderate**

writeStore() (server.js line ~2393) updates the in-memory cache, returns success to the caller, and persists to Supabase asynchronously; a failed upsert is only logged (supabase_store_write_failed) and never retried, so a paid order, new customer account, or inventory deduction can live only in RAM until the process restarts — and the live server was observed with 8 seconds of uptime, meaning restarts happen. Fix: await persistSupabaseStore() for critical stores (orders, accounts, stripe_events) before responding, add a retry queue for failures, and alert (email via Resend) when a write fails.

### Staff console writes fail silently and get reverted — no error surfacing or retry
**Impact: High · Effort: Moderate**

All console mutations (order status, staff notes, inventory counts, customer profiles, quotes) go through push() in store.js (line ~594), which is explicitly fire-and-forget and swallows every failure including 401s from an expired staff session. The local cache updates immediately so the edit looks saved, then the next syncFromServer() pulls server truth and silently erases it — a classic 'I updated that order yesterday, where did it go?' bug, worse with two staff devices. Fix: check the push() response, show a 'Not saved — you are signed out / offline' toast, and queue failed writes for retry on reconnect.

### No real backup or data export — one Supabase row per store, last-write-wins, no history
**Impact: High · Effort: Moderate**

The entire business (orders, customers, accounts with password hashes, quotes, settings) lives as single JSON blobs in the app_stores table, overwritten wholesale on every write with no version history; the only export is a client-side CSV of the orders localStorage cache in reports.js. One bad deploy, a concurrent second instance during a Hostinger restart, or a stray writeStore can clobber all orders irrecoverably. Fix: add a staff-only 'Download all data' endpoint that dumps every store as JSON, schedule a nightly export (cron + pg_dump or the Supabase API), and enable Supabase point-in-time recovery / daily backups on the project.

### No monitoring or alerting: errors go into an invisible store and /health checks nothing
**Impact: Medium · Effort: Quick win**

logOperationalEvent() writes stripe_webhook_failed, supabase_store_write_failed, email errors, etc. into an app_events store capped at 1000 rows (server.js line ~2479), but no console page displays it and nothing alerts the owner — a broken Stripe webhook or dead Supabase key would go unnoticed until a customer complains. /health (server.js line ~187) returns 'healthy' without probing Supabase, Stripe, or Resend. Fix: point a free uptime monitor (UptimeRobot/BetterStack) at /health, make /health verify the Supabase connection, email the owner on error-level app_events, and add an 'System events' panel to settings.html.

### 'Reseed demo data' button ships in the production staff console
**Impact: Medium · Effort: Quick win**

settings.html includes a Reseed button (settings.js line ~243) that force-overwrites the device's local orders, quotes, customers, inventory, and feedback caches with fictional records (Maria Delgado, Cascade Builders, fake card txn IDs from store.js seedDemoData). On the live site a curious staffer clicking it sees fake orders mixed into their console until the next successful sync — and if the API is unreachable or their session expired, they could email or fulfill against fiction. Fix: remove the button and the seedDemoData path from production (or gate it behind localhost detection).

### Contact-form photos stored as base64 in the feedback store will bloat Supabase and break the staff cache
**Impact: Medium · Effort: Moderate**

contact.html attaches up to 10 downscaled JPEG data URLs (~100-400KB each) per message, and handleListStore POST (server.js line ~1279) accepts the payload unvalidated into the 'feedback' store — so every new message rewrites the entire ever-growing blob to Supabase, and every staff page mirrors the whole thing into localStorage where the ~5MB quota makes writeJson fail silently (store.js swallows the exception), quietly breaking the console's message cache. Fix: upload photos to Supabase Storage (or strip them server-side past a cap), whitelist accepted feedback fields, and prune resolved messages older than N months.

## Mobile Experience

### After 'Add to cart' on a phone, the 'View cart' button does nothing and the cart is hard to reach
**Impact: High · Effort: Quick win**

On product.html the confirmation toast's action calls L.openDrawer (product.js:285), but the V5 cart drawer is suppressed in v6.css:57 (.drawer { display:none !important }) and no page contains the #drawerBody markup store.js needs — so tapping 'View cart' is a silent no-op. Worse, on mobile the PDP hides the bottom tab bar (body.has-buybar hides .v6-tabbar, v6.css:327) and the header auto-hides on scroll-down, so a shopper who just added cartons has no visible path to the cart. Point the toast action at ./cart.html and consider keeping a cart affordance visible on the PDP; this is the single most conversion-critical mobile flow on the site.

### Staff Inventory, Products and Customers tables are unusable on a phone
**Impact: High · Effort: Moderate**

orders.html:15-30 collapses order rows into two-line cards below 700px, but the same treatment was never applied to inventory.js:33 (grid 48px 1.6fr 1fr 0.8fr 150px), products.js:23 (6 columns) or customers.js:58 (5 columns). On a 375px phone the fixed 48px thumb + 150px 'Set stock' column + 4×16px gaps leave roughly 70px for the three flexible columns, so floor names, status badges and prices overlap into an unreadable mash. For an owner who checks stock and looks up customers from his phone at the warehouse, replicating the orders-page card collapse (and keeping the 40px stock input full-width per row) is the fix.

### Checkout brings up the wrong phone keyboards (phone and ZIP fields)
**Impact: Medium · Effort: Quick win**

checkout.html:29 renders the Phone field as a plain text input (no type="tel"), and the ZIP field at checkout.html:45 has no inputmode="numeric" — mobile buyers get the full QWERTY keyboard for both, adding friction at the highest-stakes form on the site. samples.html:38 has the same ZIP problem on the free-sample form (the top lead-gen funnel). contact.html:79-83 already does this correctly (type="tel", inputmode), so it is a copy-paste consistency fix.

### Sticky buy bar covers the last ~28px of every product page on modern iPhones
**Impact: Medium · Effort: Quick win**

The fixed mobile buy bar pads itself with env(safe-area-inset-bottom) (v6.css:1196) so it grows ~34px taller on Face ID iPhones, but the page's compensating padding is a flat 80px (body.has-buybar { padding-bottom: 80px } at v6.css:325 and :1195). The bar is ~74px + inset ≈ 108px tall, so the bottom ~28px of the page — the footer's Privacy/Terms/Accessibility row and part of the service-area text — is permanently hidden behind the bar. Change the padding to calc(80px + env(safe-area-inset-bottom)) to match the default tab-bar rule at v6.css:323, which already does this correctly.

### Sub-16px inputs trigger iOS Safari auto-zoom on catalog filters and the entire staff console
**Impact: Medium · Effort: Quick win**

iOS Safari zooms the page whenever a focused field's font-size is under 16px, and the viewport meta (correctly) doesn't block zoom. Offenders: the catalog sort/filter selects at 13px/14px (v6.css:478, :526), the staff console page search at 14px (console.css:34, used on Orders/Inventory/Products), and the global ⌘K search input at 15.5px (console.css:246). Every tap on these fields lurches the layout sideways and leaves the user zoomed in. Storefront checkout fields already use 16px (v6.css:548) — bump the rest to match.

### Toasts pop up on top of the bottom tab bar and buy bar
**Impact: Medium · Effort: Quick win**

The toast is fixed at bottom: 24px with z-index 200 (v6.css:60), while the mobile tab bar and PDP buy bar occupy the bottom ~66-108px at z-index 69/70. Every 'Added to cart' / 'Stock updated' toast therefore lands directly over the Cart tab or the Add-to-cart button, hiding the control the user is most likely to tap next. Inside the ≤860px media query, raise the toast to sit above the bars, e.g. bottom: calc(90px + env(safe-area-inset-bottom)) — the compare tray already does exactly this (v6.css:394).

### Compare-floors dialog is crushed to unreadable columns on phones
**Impact: Medium · Effort: Moderate**

The compare feature is deliberately exposed on mobile (checkbox always visible ≤860px, v6.css:517), but the dialog grid is '180px repeat(n, minmax(0,1fr))' (catalog.js:170) with 20px column gaps. In a ~343px-wide dialog on a 375px phone, the 180px label column leaves ~50-70px per floor when comparing 2-3 floors — spec values wrap letter-by-letter. Either give the table a min-width with horizontal scroll (the pattern already used for .wty-table at v6.css:1020-1021) or switch to a stacked per-floor layout under ~640px.

### Several destructive/frequent controls are far below the 44px tap-target minimum
**Impact: Low · Effort: Quick win**

The cart line 'Remove' button (v6.css:576) is 12px underlined text with no padding or min-height — a ~15px-tall target sitting near the 42px stepper buttons, easy to fat-finger on cart.html where order edits happen. Account address 'Edit'/'Delete' buttons are min-height 32px (v6.css:776). Apple HIG and Android guidance both call for 44-48px targets; add min-height 44px plus padding (hit area, not visual size) to these controls.

## The Quick-Win Checklist

Everything above marked *Quick win*, in one list to burn down:

- [ ] Phone number is missing from the site header and footer *(High impact)*
- [ ] Product page claims a 'Lifetime warranty' the warranty page contradicts *(High impact)*
- [ ] Buy box says 'Ships in 2 days' even on backordered floors, and stock is never enforced *(Medium impact)*
- [ ] No 'you're $X away from free delivery' nudge in cart or drawer *(Medium impact)*
- [ ] Catalog wastes filter space on a dead 'Type' dropdown and loses filter state on back-navigation *(Low impact)*
- [ ] LocalBusiness schema is missing the core local-pack signals: address, hours, geo, and Google Business Profile link *(High impact)*
- [ ] Open Graph tags are injected client-side, so shared links show no image on Facebook, iMessage, WhatsApp, or Slack *(High impact)*
- [ ] FAQ page has rich Q&A content but emits no FAQPage structured data *(Medium impact)*
- [x] JS/CSS ship with 'no-cache' on the live site, so every visitor re-downloads everything on every page view *(High impact)*
- [ ] Google Fonts loaded via @import inside v6.css adds a render-blocking request chain *(Medium impact)*
- [ ] Homepage 'best sellers' grid loads 8 below-the-fold card images eagerly and only after the full JS chain *(Medium impact)*
- [ ] Several lifestyle photos ship at full size where responsive variants are missing or unused *(Low impact)*
- [ ] Keyboard users tab onto invisible 'Save' and 'Compare' buttons on every product card *(High impact)*
- [ ] 'Added to cart' toasts are never announced to screen readers *(High impact)*
- [ ] The main product photo on the PDP has no text alternative *(Medium impact)*
- [ ] No skip-to-content link on any page *(Medium impact)*
- [ ] The --faint text token (#858585) fails AA contrast where it carries real information — including order-tracking status steps *(Medium impact)*
- [ ] prefers-reduced-motion coverage is partial — smooth scroll and large hover zooms ignore it *(Low impact)*
- [ ] Closing the mobile menu or nav dropdown with Escape strands keyboard focus *(Low impact)*
- [x] Entire server source code and deploy notes are downloadable from the live site *(High impact)*
- [ ] No security response headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) *(High impact)*
- [x] Public /api/settings leaks all promo codes and pricing config to anyone *(Medium impact)*
- [ ] Contact/feedback POST is unauthenticated, unthrottled, and stores arbitrary fields *(Medium impact)*
- [ ] Replies to order emails bounce — no inbound mail for the from-address domain *(High impact)*
- [ ] No monitoring or alerting: errors go into an invisible store and /health checks nothing *(Medium impact)*
- [ ] 'Reseed demo data' button ships in the production staff console *(Medium impact)*
- [ ] After 'Add to cart' on a phone, the 'View cart' button does nothing and the cart is hard to reach *(High impact)*
- [ ] Checkout brings up the wrong phone keyboards (phone and ZIP fields) *(Medium impact)*
- [ ] Sticky buy bar covers the last ~28px of every product page on modern iPhones *(Medium impact)*
- [ ] Sub-16px inputs trigger iOS Safari auto-zoom on catalog filters and the entire staff console *(Medium impact)*
- [ ] Toasts pop up on top of the bottom tab bar and buy bar *(Medium impact)*
- [ ] Several destructive/frequent controls are far below the 44px tap-target minimum *(Low impact)*

---
*56 findings total: 9 selling more, 8 getting found, 8 speed, 8 accessibility, 6 security & robustness, 9 data reliability & operations, 8 mobile experience.*