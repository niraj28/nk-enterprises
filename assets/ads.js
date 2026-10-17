// AdSense placements for article pages and the card maker.
// The homepage has no manual slots on purpose: it's for enquiries, not ads.
//
// HOW TO TURN ON (after AdSense approves the site):
// 1. AdSense → Ads → By ad unit → In-article → create it, then copy the number
//    from data-ad-slot="..." in the code AdSense shows you.
// 2. Paste it below as inArticleSlot and push. Every <div class="ad-slot"> gets an ad.
// Until then this file does nothing, and Auto ads (if turned on in AdSense) still work.
const ADSENSE = {
  client: "ca-pub-6116067692659093",
  inArticleSlot: "" // e.g. "1234567890"
};

(function () {
  if (!ADSENSE.inArticleSlot) return;
  document.querySelectorAll(".ad-slot").forEach(function (slot) {
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.style.textAlign = "center";
    ins.setAttribute("data-ad-layout", "in-article");
    ins.setAttribute("data-ad-format", "fluid");
    ins.setAttribute("data-ad-client", ADSENSE.client);
    ins.setAttribute("data-ad-slot", ADSENSE.inArticleSlot);
    slot.appendChild(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
})();
