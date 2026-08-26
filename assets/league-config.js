/* ------------------------------------------------------------------
   League configuration. Edit this file to point the site at a
   different GameSheet season — nothing else needs to change.
   ------------------------------------------------------------------ */
window.NIHC_CONFIG = {
  // GameSheet season powering fixtures, scores and standings.
  seasonId: "11696",
  gamesheetBase: "https://gamesheetstats.com",

  // Passed through to the GameSheet embed so it matches this site's palette.
  embedColours: { primary: "E9EFF5", secondary: "0F151D" },

  // Embedded GameSheet views, in tab order.
  views: [
    { id: "schedule", label: "Schedule", path: "schedule" },
    { id: "standings", label: "Standings", path: "standings" },
    { id: "scores", label: "Scores", path: "scores" },
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
