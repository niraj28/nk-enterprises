# N.K.Enterprises website

Website for **Surendra Kumar, Authorised LIC Agent**. It's plain HTML and CSS, with no build step and nothing to install.

## What's where

| File | Page |
|---|---|
| `index.html` | Homepage: intro, festival card link, plans, why choose me, contact |
| `durga-puja/index.html` | Festival wish card maker (photo + name → share on WhatsApp) |
| `blog/index.html` | List of insurance tips |
| `blog/*.html` | One file per article |
| `privacy.html` | Privacy policy (required by Google AdSense) |
| `404.html` | "Page not found" page |
| `assets/style.css` | Colours, fonts and layout for every page |
| `assets/` | LIC logo and Surendra Kumar's photo |
| `ads.txt` | Tells advertisers this site's AdSense account (pub-6116067692659093) |

## Editing

- **Change text:** open the `.html` file, edit the words between the tags, and save.
- **Change the phone number:** search all files for `9431487230` and replace it.
- **Add a blog post:** copy `blog/term-vs-endowment.html` to a new file name and change the title, description and article text. Then add a card for it at the top of the list in `blog/index.html`, and a `<url>` line for it in `sitemap.xml`.

Live site: **https://digitallifenotes.blog/** (DNS is managed in WordPress.com → Domains → digitallifenotes.blog → DNS records).
- The header and footer are repeated in every page. If you change them, change them everywhere.

## Deploying

Every push to the `main` branch publishes the site automatically with GitHub Pages:

```bash
git add -A
git commit -m "Describe your change"
git push
```

The live site updates in about a minute.

### Connecting your own domain

1. Buy a domain (for example `nkenterprises.in`).
2. In the repo on GitHub, go to **Settings → Pages → Custom domain** and enter it. GitHub creates a `CNAME` file.
3. At your domain registrar, add these DNS records:
   - Four `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One `CNAME` record for `www` pointing to `niraj28.github.io`
4. Back in **Settings → Pages**, tick **Enforce HTTPS** once it's available.

## Google AdSense

The AdSense script is already in the `<head>` of every page, and `ads.txt` is in place.

1. Connect your own domain first. AdSense doesn't approve `github.io` addresses.
2. In AdSense, add the site with your domain and request a review.
3. Keep adding helpful articles. A site with 15–20 good posts is much more likely to be approved.
4. After approval, use **Auto ads** in AdSense. To keep ads off the homepage, add it as an excluded page under **Ads → By site → Edit → Page exclusions**.
