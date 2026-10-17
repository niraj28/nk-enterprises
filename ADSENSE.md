# AdSense go-live plan

Publisher ID: **pub-6116067692659093** · Site: **https://digitallifenotes.blog**

## Already done in the code

- The AdSense script (`adsbygoogle.js?client=ca-pub-6116067692659093`) is in the `<head>` of every page. Google uses it to verify the site.
- `ads.txt` is at the site root with the correct publisher line.
- `privacy.html` has the cookie and advertising wording AdSense requires.
- `sitemap.xml` and `robots.txt` are in place for Google Search.
- Ad spaces (`<div class="ad-slot">`) are on blog posts (2 per article) and on the card maker. They stay empty until switched on (step 5).
- The homepage has no manual ad spaces on purpose, so enquiries come first.

## What you do (in your Google account)

1. **Wait for HTTPS.** https://digitallifenotes.blog must show a padlock. GitHub issues the certificate automatically after the DNS change.
2. **Google Search Console** (search.google.com/search-console): add the property `digitallifenotes.blog` and submit `https://digitallifenotes.blog/sitemap.xml`.
3. **AdSense → Sites → Add site:** enter `digitallifenotes.blog`. When AdSense asks how to verify, choose the **AdSense code snippet**. It's already installed, so just tick "I've placed the code" and click **Verify**, then **Request review**.
4. **AdSense → Privacy & messaging:** create the European regulations (GDPR) message using Google's own consent tool. Google requires this for visitors from the EEA, UK and Switzerland. No code change is needed.
5. **After approval** (usually days to a few weeks):
   - **Auto ads:** AdSense → Ads → By site → digitallifenotes.blog → turn on Auto ads. Under **Page exclusions**, exclude the homepage `https://digitallifenotes.blog/`.
   - **In-article ads:** AdSense → Ads → By ad unit → **In-article** → create. Copy the `data-ad-slot` number, put it in `assets/ads.js` as `inArticleSlot`, and push. All the ad spaces fill automatically.

## Improving approval chances

- AdSense often rejects sites for "low value content". Aim for **15–20 original, helpful posts** before requesting review. Topics that bring the right visitors:
  - How to check LIC policy status online
  - Documents needed for an LIC death claim
  - Best LIC plans for a child's education: what to look for
  - LIC policy loan: how it works
  - How to change the nominee in an LIC policy
  - Term insurance for housewives and self-employed people
  - Tax benefits on life insurance premiums (80C, 10(10D))
  - LIC maturity claim: step-by-step
  - Hindi versions of the most popular posts
- Make every page reachable from the menu or the blog list, which it already is.
- Don't click your own ads, and don't ask friends to. That gets accounts banned.

## If AdSense rejects the site

Read the reason in AdSense → Sites, fix it (usually more content), and request review again after 2–4 weeks.
