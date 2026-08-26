/* ------------------------------------------------------------------
   Shared site behaviour: navigation, scroll reveal, GameSheet embeds
   and the native scoreboard fed by /api/stats. A scoreboard carrying
   data-team shows only that club's games, which is what drives the
   fixture strip on each team page.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var CONFIG = window.NIHC_CONFIG || {};

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] === null || attrs[key] === undefined) return;
        if (key === "class") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  /* ---------- navigation ---------- */
  function initNav() {
    var toggle = document.querySelector(".navtoggle");
    var links = document.querySelector(".navlinks");
    if (!toggle || !links) return;

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      links.setAttribute("data-open", String(!open));
    });

    links.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        links.setAttribute("data-open", "false");
      }
    });
  }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    var targets = document.querySelectorAll("[data-rise]");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (node) { node.classList.add("is-in"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    targets.forEach(function (node) { observer.observe(node); });
  }

  /* Stagger siblings inside a container marked data-rise-group */
  function initStagger() {
    document.querySelectorAll("[data-rise-group]").forEach(function (group) {
      var step = Number(group.getAttribute("data-rise-group")) || 70;
      Array.prototype.forEach.call(group.children, function (child, index) {
        if (!child.hasAttribute("data-rise")) child.setAttribute("data-rise", "");
        child.style.setProperty("--rise-delay", index * step + "ms");
      });
    });
  }

  /* ---------- GameSheet embeds ---------- */
  function embedUrl(path) {
    var colours = CONFIG.embedColours || {};
    var query =
      "configuration[primary-colour]=" + encodeURIComponent(colours.primary || "FFFFFF") +
      "&configuration[secondary-colour]=" + encodeURIComponent(colours.secondary || "1A2841");
    return (
      (CONFIG.gamesheetBase || "https://gamesheetstats.com") +
      "/seasons/" + encodeURIComponent(CONFIG.seasonId) +
      "/" + path + "?" + query
    );
  }

  function mountEmbed(frame, path, title) {
    if (!frame) return;
    frame.setAttribute("title", title);
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    frame.src = embedUrl(path);
  }

  function initEmbedTabs() {
    var host = document.querySelector("[data-embed-tabs]");
    if (!host) return;

    var tabs = host.querySelector(".tabs");
    var frame = host.querySelector("iframe");
    var views = CONFIG.views || [];
    if (!tabs || !frame || !views.length) return;

    views.forEach(function (view, index) {
      var button = el("button", {
        type: "button",
        role: "tab",
        id: "tab-" + view.id,
        "aria-selected": index === 0 ? "true" : "false",
        text: view.label,
      });
      button.addEventListener("click", function () {
        tabs.querySelectorAll("button").forEach(function (other) {
          other.setAttribute("aria-selected", String(other === button));
        });
        mountEmbed(frame, view.path, "GameSheet " + view.label);
      });
      tabs.appendChild(button);
    });

    tabs.setAttribute("role", "tablist");
    mountEmbed(frame, views[0].path, "GameSheet " + views[0].label);
  }

  /* ---------- native scoreboard ---------- */
  var KICKOFF_FORMAT = { weekday: "short", day: "numeric", month: "short" };

  function formatWhen(iso) {
    if (!iso) return "Date to be confirmed";
    var when = new Date(iso);
    if (isNaN(when.getTime())) return String(iso);
    var day = when.toLocaleDateString(undefined, KICKOFF_FORMAT);
    var time = when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return day + " · " + time;
  }

  function statusLabel(game) {
    if (game.status === "live") return "Live";
    if (game.status === "final") return "Full time";
    return "Upcoming";
  }

  function sideline(team, opponent, decided) {
    var beaten =
      decided &&
      typeof team.score === "number" &&
      typeof opponent.score === "number" &&
      team.score < opponent.score;

    return el("div", { class: "sideline" + (beaten ? " sideline--beaten" : "") }, [
      el("span", { class: "sideline__team", text: team.name || "TBC" }),
      el("span", {
        class: "sideline__score",
        text: typeof team.score === "number" ? String(team.score) : "–",
      }),
    ]);
  }

  function gameCard(game) {
    var decided = game.status === "final" || game.status === "live";
    var meta = [game.division, game.venue].filter(Boolean).join(" · ");

    return el("article", { class: "gamecard" }, [
      el("div", { class: "gamecard__top" }, [
        el("span", {
          class: "pip" + (game.status === "live" ? " pip--live" : game.status === "final" ? " pip--final" : ""),
          text: statusLabel(game),
        }),
        el("span", { text: game.status === "scheduled" ? formatWhen(game.startsAt) : "" }),
      ]),
      el("div", {}, [
        sideline(game.away, game.home, decided),
        sideline(game.home, game.away, decided),
      ]),
      el("div", { class: "gamecard__foot", text: meta || formatWhen(game.startsAt) }),
    ]);
  }

  /* Games involving one club. Matched loosely because GameSheet team
     names carry suffixes ("Altrincham Jets U18", "Jets 1") that we do
     not control, and a team page showing nothing is worse than a team
     page showing a near-match. */
  function involvesTeam(game, needle) {
    var target = String(needle || "").toLowerCase().trim();
    if (!target) return true;

    var words = target.split(/\s+/);

    return [game.home, game.away].some(function (side) {
      var name = String((side && side.name) || "").toLowerCase();
      if (!name) return false;
      if (name.indexOf(target) !== -1) return true;
      /* Fall back to the distinctive last word — "maplehawks", "jets". */
      return name.indexOf(words[words.length - 1]) !== -1;
    });
  }

  /* Live games first, then the next fixtures, then the latest results. */
  function orderGames(games, limit) {
    var now = Date.now();
    var live = games.filter(function (g) { return g.status === "live"; });

    var upcoming = games
      .filter(function (g) { return g.status === "scheduled"; })
      .sort(function (a, b) {
        return (Date.parse(a.startsAt) || now) - (Date.parse(b.startsAt) || now);
      });

    var finished = games
      .filter(function (g) { return g.status === "final"; })
      .sort(function (a, b) {
        return (Date.parse(b.startsAt) || 0) - (Date.parse(a.startsAt) || 0);
      });

    return live.concat(upcoming, finished).slice(0, limit);
  }

  function skeletons(host, count) {
    host.textContent = "";
    for (var i = 0; i < count; i += 1) {
      host.appendChild(
        el("article", { class: "gamecard" }, [
          el("div", { class: "gamecard__top" }, [el("span", { class: "skeleton", text: "Loading" })]),
          el("div", {}, [
            el("div", { class: "sideline" }, [
              el("span", { class: "sideline__team skeleton", text: "Team name" }),
              el("span", { class: "sideline__score skeleton", text: "0" }),
            ]),
            el("div", { class: "sideline" }, [
              el("span", { class: "sideline__team skeleton", text: "Team name" }),
              el("span", { class: "sideline__score skeleton", text: "0" }),
            ]),
          ]),
          el("div", { class: "gamecard__foot" }, [el("span", { class: "skeleton", text: "Venue" })]),
        ])
      );
    }
  }

  function initScoreboard() {
    var host = document.querySelector("[data-scoreboard]");
    if (!host) return;

    var limit = Number(host.getAttribute("data-limit")) || 6;
    var team = host.getAttribute("data-team") || "";
    var fallback = document.querySelector("[data-scoreboard-fallback]");
    var stamp = document.querySelector("[data-scoreboard-stamp]");

    function showFallback(message) {
      host.hidden = true;
      if (fallback) {
        fallback.hidden = false;
        var note = fallback.querySelector("[data-fallback-note]");
        if (note && message) note.textContent = message;
      }
    }

    skeletons(host, Math.min(limit, 3));

    fetch(CONFIG.statsEndpoint || "/api/stats", { headers: { accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("stats request failed");
        return response.json();
      })
      .then(function (data) {
        var all = data && data.games ? data.games : [];
        var mine = team
          ? all.filter(function (game) { return involvesTeam(game, team); })
          : all;
        var games = orderGames(mine, limit);

        if (!data || data.available === false) {
          showFallback(data && data.reason ? data.reason : null);
          return;
        }

        if (!games.length) {
          showFallback(
            team
              ? "No " + team + " games have been published to the stats engine yet."
              : null
          );
          return;
        }

        host.textContent = "";
        games.forEach(function (game, index) {
          var card = gameCard(game);
          card.setAttribute("data-rise", "");
          card.style.setProperty("--rise-delay", index * 60 + "ms");
          host.appendChild(card);
        });

        if (fallback) fallback.hidden = true;
        if (stamp && data.fetchedAt) {
          stamp.textContent =
            (data.stale ? "Last known scores · " : "Updated ") + formatWhen(data.fetchedAt);
        }
        initReveal();
      })
      .catch(function () {
        showFallback(null);
      });
  }

  /* ---------- registration arriving from a club page ---------- */
  /* /register?club=<slug> pre-fills the club field and says so on screen,
     so the answer is never quietly wrong. The slug is looked up against
     the configured club list rather than trusted, which keeps arbitrary
     query-string text out of the form. */
  function initClubPrefill() {
    var field = document.getElementById("currentClub");
    if (!field) return;

    var slug = "";
    try {
      slug = new URLSearchParams(window.location.search).get("club") || "";
    } catch (error) {
      return;
    }
    if (!slug) return;

    var match = (CONFIG.clubs || []).filter(function (club) {
      return club.slug === slug;
    })[0];
    if (!match) return;

    if (!field.value) field.value = match.name;

    var banner = document.querySelector("[data-club-banner]");
    if (banner) {
      var name = banner.querySelector("[data-club-name]");
      if (name) name.textContent = match.name;
      banner.hidden = false;
    }
  }

  /* ---------- misc ---------- */
  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initSeasonLabels() {
    var label = (CONFIG.season && CONFIG.season.label) || "";
    if (!label) return;
    document.querySelectorAll("[data-season-label]").forEach(function (node) {
      node.textContent = label;
    });
  }

  window.NIHC = { el: el, embedUrl: embedUrl, initReveal: initReveal };

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initStagger();
    initReveal();
    initEmbedTabs();
    initScoreboard();
    initYear();
    initSeasonLabels();
    initClubPrefill();
  });
})();
