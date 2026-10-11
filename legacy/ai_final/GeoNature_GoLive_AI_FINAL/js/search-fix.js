/* GeoNature search-fix: standalone, independent universal search. */
(function () {
  "use strict";

  function byId(id) { return document.getElementById(id); }
  function normalize(value) {
    return String(value || "")
      .toLocaleLowerCase("ka-GE")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch];
    });
  }
  function icon(group) {
    if (group === "ფრინველი") return "🐦";
    if (group === "ძუძუმწოვარი") return "🦌";
    if (group === "თევზი") return "🐟";
    return "🌿";
  }
  function words(item) {
    return normalize([
      item.ka, item.en, item.latin, item.group, item.habitat,
      item.regions, item.season, item.active, item.desc,
      Array.isArray(item.tags) ? item.tags.join(" ") : ""
    ].join(" "));
  }

  function getData() {
    try {
      return Array.isArray(window.__GEONATURE_SEARCH_DATA__) ? window.__GEONATURE_SEARCH_DATA__ : GEO_SPECIES;
    } catch (e) {
      return [];
    }
  }

  var DATA = getData();
  var imageCache = new Map();
  var searchInput;
  var suggestBox;
  var resultGrid;
  var detailPanel;
  var countBox;
  var activeGroup = "all";

  function matches(item, query) {
    var q = normalize(query);
    if (!q) return true;
    var source = words(item);
    return q.split(" ").filter(Boolean).every(function (part) { return source.indexOf(part) !== -1; });
  }

  function score(item, query) {
    var q = normalize(query);
    var n = normalize(item.ka);
    var en = normalize(item.en);
    var latin = normalize(item.latin);
    if (!q) return 0;
    if (n === q) return 100;
    if (latin === q || en === q) return 95;
    if (n.indexOf(q) === 0) return 90;
    if (en.indexOf(q) === 0 || latin.indexOf(q) === 0) return 82;
    if (n.indexOf(q) !== -1 || en.indexOf(q) !== -1 || latin.indexOf(q) !== -1) return 70;
    return 30;
  }

  function resultsFor(query) {
    return DATA
      .filter(function (item) { return activeGroup === "all" || item.group === activeGroup; })
      .filter(function (item) { return matches(item, query); })
      .sort(function (a, b) { return score(b, query) - score(a, query) || a.ka.localeCompare(b.ka, "ka"); });
  }

  async function commonsImage(item) {
    if (imageCache.has(item.id)) return imageCache.get(item.id);
    var promise = (async function () {
      var query = encodeURIComponent((item.latin || item.en || item.ka) + " " + item.ka);
      var api = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=" + query + "&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&format=json&origin=*";
      try {
        var response = await fetch(api, { cache: "force-cache" });
        if (!response.ok) throw new Error("image request failed");
        var data = await response.json();
        var page = Object.values((data.query && data.query.pages) || {})[0];
        var info = page && page.imageinfo && page.imageinfo[0];
        var result = info ? {
          src: info.thumburl || info.url || "",
          original: info.url || info.thumburl || "",
          credit: (((info.extmetadata || {}).Artist || {}).value || ((info.extmetadata || {}).Credit || {}).value || "Wikimedia Commons")
        } : null;
        imageCache.set(item.id, result);
        return result;
      } catch (error) {
        imageCache.set(item.id, null);
        return null;
      }
    })();
    imageCache.set(item.id, promise);
    var value = await promise;
    imageCache.set(item.id, value);
    return value;
  }

  function placeholder(item) {
    return "<div class=\"fix-image-placeholder\"><span>" + icon(item.group) + "</span><small>ფოტო იტვირთება…</small></div>";
  }

  function card(item) {
    return "<article class=\"fix-card\" data-fix-id=\"" + item.id + "\" tabindex=\"0\">" +
      "<div class=\"fix-card-media\" data-media=\"" + item.id + "\">" + placeholder(item) + "</div>" +
      "<div class=\"fix-card-body\">" +
      "<span class=\"fix-badge\">" + icon(item.group) + " " + esc(item.group) + "</span>" +
      "<h3>" + esc(item.ka) + "</h3>" +
      "<p class=\"fix-latin\">" + esc(item.latin || item.en) + "</p>" +
      "<p class=\"fix-desc\">" + esc(item.desc || "") + "</p>" +
      "<div class=\"fix-meta\"><span>📍 " + esc((item.regions || "").split(",")[0]) + "</span><span>🕒 " + esc(item.active || "") + "</span></div>" +
      "</div></article>";
  }

  async function loadCardImage(item) {
    var target = document.querySelector('[data-media="' + item.id + '"]');
    if (!target) return;
    var result = await commonsImage(item);
    if (!document.body.contains(target)) return;
    if (result && result.src) {
      target.innerHTML = "<img class=\"fix-card-image\" src=\"" + esc(result.src) + "\" alt=\"" + esc(item.ka) + "\" loading=\"lazy\">";
    } else {
      target.innerHTML = placeholder(item).replace("ფოტო იტვირთება…", "ფოტო ვერ ჩაიტვირთა");
    }
  }

  async function openDetail(item) {
    if (!detailPanel) return;
    detailPanel.innerHTML = "<div class=\"fix-detail-loading\">იტვირთება…</div>";
    var result = await commonsImage(item);
    var img = result && result.src ? "<img class=\"fix-detail-image\" src=\"" + esc(result.src) + "\" alt=\"" + esc(item.ka) + "\">" : placeholder(item);
    detailPanel.innerHTML =
      "<div class=\"fix-detail\">" +
        "<div class=\"fix-detail-media\">" + img + "</div>" +
        "<div class=\"fix-detail-body\">" +
          "<span class=\"fix-badge\">" + icon(item.group) + " " + esc(item.group) + "</span>" +
          "<h2>" + esc(item.ka) + "</h2>" +
          "<p class=\"fix-latin\">" + esc(item.en || "") + " · <i>" + esc(item.latin || "") + "</i></p>" +
          "<p class=\"fix-detail-desc\">" + esc(item.desc || "") + "</p>" +
          "<div class=\"fix-info-grid\">" +
            "<div><small>ჰაბიტატი</small><b>🌿 " + esc(item.habitat || "—") + "</b></div>" +
            "<div><small>გავრცელება</small><b>📍 " + esc(item.regions || "—") + "</b></div>" +
            "<div><small>სეზონი</small><b>📅 " + esc(item.season || "—") + "</b></div>" +
            "<div><small>აქტივობა</small><b>🕒 " + esc(item.active || "—") + "</b></div>" +
          "</div>" +
          "<div class=\"fix-actions\"><a class=\"gn-button primary\" href=\"map.html?species=" + encodeURIComponent(item.ka) + "\">🗺️ რუკაზე ნახვა</a>" +
          (result && result.src ? "<button class=\"gn-button\" type=\"button\" data-open-photo=\"" + esc(result.original || result.src) + "\">🔍 დიდი ფოტო</button>" : "") +
          "</div>" +
        "</div>" +
      "</div>";
    var open = detailPanel.querySelector("[data-open-photo]");
    if (open) open.onclick = function () { window.open(open.getAttribute("data-open-photo"), "_blank", "noopener"); };
    detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderSuggestions(query) {
    if (!suggestBox) return;
    var q = normalize(query);
    if (!q) {
      suggestBox.classList.remove("open");
      suggestBox.innerHTML = "";
      return;
    }
    var items = resultsFor(q).slice(0, 8);
    suggestBox.innerHTML = items.length ? items.map(function (item) {
      return "<button type=\"button\" class=\"fix-suggestion\" data-fix-suggest=\"" + item.id + "\"><span>" + icon(item.group) + "</span><span><b>" + esc(item.ka) + "</b><small>" + esc(item.en || item.latin || "") + " • " + esc(item.group) + "</small></span></button>";
    }).join("") : "<div class=\"fix-no-suggestion\">შედეგი ვერ მოიძებნა</div>";
    suggestBox.classList.add("open");
    suggestBox.querySelectorAll("[data-fix-suggest]").forEach(function (button) {
      button.onclick = function () {
        var item = DATA.find(function (x) { return x.id === Number(button.dataset.fixSuggest); });
        if (!item) return;
        searchInput.value = item.ka;
        suggestBox.classList.remove("open");
        render();
        openDetail(item);
      };
    });
  }

  function render() {
    var query = searchInput ? searchInput.value : "";
    var items = resultsFor(query);
    if (countBox) countBox.textContent = items.length + " შედეგი";
    if (!resultGrid) return;
    resultGrid.innerHTML = items.length ? items.map(card).join("") : "<div class=\"fix-empty\"><b>🔎</b><h3>ვერ მოიძებნა</h3><p>სცადე სხვა ქართული, ინგლისური ან ლათინური სახელი.</p></div>";
    resultGrid.querySelectorAll("[data-fix-id]").forEach(function (el) {
      var item = DATA.find(function (x) { return x.id === Number(el.dataset.fixId); });
      el.onclick = function (event) { if (event.target.closest("button")) return; openDetail(item); };
      el.onkeydown = function (event) { if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) { event.preventDefault(); openDetail(item); } };
    });
    items.slice(0, 30).forEach(loadCardImage);
  }

  function setup() {
    searchInput = byId("mainSearch");
    suggestBox = byId("mainSuggest");
    resultGrid = byId("resultGrid");
    detailPanel = byId("detailPanel");
    countBox = byId("catalogCount");
    if (!searchInput || !resultGrid || !detailPanel) return;

    searchInput.addEventListener("input", function () {
      render();
      renderSuggestions(searchInput.value);
    });
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        var items = resultsFor(searchInput.value);
        if (items[0]) openDetail(items[0]);
        if (suggestBox) suggestBox.classList.remove("open");
      }
      if (event.key === "Escape" && suggestBox) suggestBox.classList.remove("open");
    });

    var clear = byId("clearMainSearch");
    if (clear) clear.onclick = function () { searchInput.value = ""; activeGroup = "all"; render(); renderSuggestions(""); searchInput.focus(); };

    document.querySelectorAll(".gn-filter").forEach(function (button) {
      button.onclick = function () {
        document.querySelectorAll(".gn-filter").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        activeGroup = button.dataset.group || "all";
        render();
      };
    });

    var random = byId("randomBtn");
    if (random) random.onclick = function () {
      var pool = resultsFor("");
      if (!pool.length) return;
      openDetail(pool[Math.floor(Math.random() * pool.length)]);
    };

    document.addEventListener("click", function (event) {
      if (suggestBox && !event.target.closest("#mainSearchBox")) suggestBox.classList.remove("open");
    });

    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
