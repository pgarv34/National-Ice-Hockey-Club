/* ------------------------------------------------------------------
   League configuration. Edit this file to point the site at a
   different GameSheet season — nothing else needs to change.
   ------------------------------------------------------------------ */
window.NIHC_CONFIG = {
  // GameSheet season powering fixtures, scores and standings.
  seasonId: "15760",
  gamesheetBase: "https://gamesheetstats.com",

  // GameSheet embed configuration id. The palette and layout are set against
  // this id in the GameSheet dashboard, so the site passes no styling params.
  embedConfiguration: "464",

  // Embedded GameSheet views, in tab order. Tabs only appear once there is
  // more than one view to switch between.
  views: [
    { id: "games", label: "Games", path: "games" },
  ],

  // Server-side normalising proxy over the same season.
  statsEndpoint: "/api/stats",

  season: { label: "2026 / 27 Season", registrationCloses: "2026-09-18" },

  /* Member clubs with a profile page on this site. This list is the
     allowlist for the ?club= parameter on /register — a club not named
     here cannot put text into the registration form. Adding a club means
     adding an entry here, a card on /teams and a page of its own. */
  clubs: [
    { slug: "altrincham-jets", name: "Altrincham Jets" },
    { slug: "manchester-maplehawks", name: "Manchester Maplehawks" },
  ],
};
