/* US tech and AI market map. Everything is computed in the browser from data.js (written by build.py). */
(function () {
  "use strict";
  const D = window.DASH_DATA;
  if (!D || !window.d3) {
    document.getElementById("asof").textContent = !D ? "data.js missing: run build.py first." : "d3.min.js missing.";
    return;
  }

  const DATES = D.dates, N = DATES.length;
  const PERIOD_DAYS = { "1D": 1, "1W": 5, "1M": 21, "3M": 63, "1Y": 252 };
  const PERIOD_LABEL = { "1D": "1 day", "1W": "1 week", "1M": "1 month", "3M": "3 months", YTD: "year to date", "1Y": "1 year" };
  const SCALE_MAX = { "1D": 3, "1W": 6, "1M": 10, "3M": 20, YTD: 40, "1Y": 50 };
  const UNIVERSE_LABEL = { market: "Market map", ai: "AI cluster" };
  const BENCH_FOR = { market: ["SPY", "QQQ", "RSP"], ai: ["SPY", "QQQ", "SMH"] };

  const state = { universe: "market", period: "1D", idx: N - 1 };
  try {
    const saved = JSON.parse(localStorage.getItem("mm-prefs") || "{}");
    if (saved.universe in UNIVERSE_LABEL) state.universe = saved.universe;
    if (saved.period in PERIOD_LABEL) state.period = saved.period;
  } catch (e) { /* storage blocked: defaults are fine */ }
  const savePrefs = () => { try { localStorage.setItem("mm-prefs", JSON.stringify({ universe: state.universe, period: state.period })); } catch (e) { /* ignore */ } };

  // ---------- helpers ----------
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Chart colours, read live from the kit tokens, which kit.css swaps for night mode.
  // ink / light: tile text on bright and on dark fills.
  const isDark = () => document.documentElement.dataset.theme === "night";
  const palette = () => ({
    up: css("--green"), down: css("--red"), mid: css("--border"), bg: css("--white"), fg2: css("--muted"),
    ink: isDark() ? css("--white") : css("--text"), light: css("--on-dark"),
    series: ["--series-1", "--series-2", "--series-3", "--series-4"].map(css),
  });
  let C = palette();
  const sign = (x) => (x >= 0 ? "+" : "−");
  const fmtPct = (x, d = 2) => (x == null || !isFinite(x)) ? "n/a" : sign(x) + Math.abs(x * 100).toFixed(d) + "%";
  const fmtCap = (x) => x == null ? "n/a" : x >= 1e12 ? "$" + (x / 1e12).toFixed(2) + "T" : "$" + (x / 1e9).toFixed(0) + "B";
  const parse = d3.timeParse("%Y-%m-%d");
  const fmtDate = (s) => d3.timeFormat("%a %-d %b %Y")(parse(s));
  const fmtPx = (x) => x == null ? "n/a" : "$" + x.toFixed(2);

  function startIdx(period, end) {
    if (period === "YTD") {
      const yr = DATES[end].slice(0, 4);
      let i = end;
      while (i > 0 && DATES[i - 1].slice(0, 4) === yr) i--;
      return Math.max(0, i - 1); // last close of the previous year
    }
    return Math.max(0, end - PERIOD_DAYS[period]);
  }
  const close = (t, i) => D.tickers[t] ? D.tickers[t].close[i] : null;
  const cap = (t, i) => { const c = close(t, i), s = D.tickers[t] && D.tickers[t].shares; return c != null && s ? c * s : null; };
  const ret = (t, a, b) => { const p0 = close(t, a), p1 = close(t, b); return p0 != null && p1 != null ? p1 / p0 - 1 : null; };
  // Buy-and-hold, cap-weighted basket return between two dates (companies present at both).
  function basketRet(tickers, a, b) {
    let c0 = 0, c1 = 0;
    for (const t of tickers) { const x = cap(t, a), y = cap(t, b); if (x != null && y != null) { c0 += x; c1 += y; } }
    return c0 ? c1 / c0 - 1 : null;
  }
  const uniqTickers = (u) => [...new Set(Object.values(D.universes[u]).flat())];

  function colorScale() {
    const max = SCALE_MAX[state.period] / 100;
    const f = d3.scaleLinear().domain([-max, 0, max]).range([C.down, C.mid, C.up]).interpolate(d3.interpolateLab).clamp(true);
    f.max = max; return f;
  }
  const fillFor = (col, r) => r == null ? C.mid : col(r);
  function inkOn(fill) {
    const c = d3.rgb(fill), lum = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lum(c.r) + 0.7152 * lum(c.g) + 0.0722 * lum(c.b) > 0.3 ? C.ink : C.light;
  }

  // ---------- tooltip ----------
  const tip = document.getElementById("tip");
  function showTip(evt, html) {
    tip.innerHTML = html; tip.hidden = false;
    const pad = 14, r = tip.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  const TOUCH = matchMedia("(hover: none)").matches;
  addEventListener("scroll", hideTip, { passive: true }); // a tapped tooltip should not float over the page while scrolling
  const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;

  // ---------- summary ----------
  function renderStats(a, b) {
    const ts = uniqTickers(state.universe);
    const rets = ts.map((t) => ({ t, r: ret(t, a, b) })).filter((d) => d.r != null).sort((x, y) => y.r - x.r);
    const up = rets.filter((d) => d.r > 0).length, down = rets.filter((d) => d.r < 0).length;
    const best = rets[0], worst = rets[rets.length - 1];
    const stats = [
      { v: fmtCap(d3.sum(ts, (t) => cap(t, b) || 0)), k: "Market cap", s: ts.length + " companies" },
      { v: fmtPct(basketRet(ts, a, b)), k: "Cap-weighted return, " + PERIOD_LABEL[state.period], s: "from the close of " + DATES[a] },
      { v: up + " / " + down, k: "Up / down", s: (rets.length - up - down) + " unchanged" },
      { v: best ? best.t + " " + fmtPct(best.r, 1) : "n/a", k: "Best", s: worst ? "worst " + worst.t + " " + fmtPct(worst.r, 1) : "" },
    ];
    document.getElementById("stats").innerHTML = stats.map((d) =>
      `<div class="stat"><span class="value">${d.v}</span><span class="label">${d.k}</span><span class="sub">${d.s}</span></div>`).join("");
  }

  // ---------- treemap ----------
  function renderMap(a, b) {
    const el = document.getElementById("map");
    const W = el.clientWidth, H = W < 700 ? Math.round(Math.min(760, W * 1.7)) : Math.max(420, Math.min(720, Math.round(W * 0.56)));
    const children = Object.entries(D.universes[state.universe]).map(([g, ts]) => ({
      name: g, children: ts.map((t) => ({ t, g, value: cap(t, b) || 0, r: ret(t, a, b) })).filter((d) => d.value > 0),
    })).filter((g) => g.children.length);
    const root = d3.hierarchy({ children }).sum((d) => d.value || 0).sort((x, y) => y.value - x.value);
    d3.treemap().size([W, H]).paddingOuter(1).paddingTop(19).paddingInner(1).round(true)(root);
    const col = colorScale();

    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", UNIVERSE_LABEL[state.universe] + " treemap, sized by market cap, coloured by " + PERIOD_LABEL[state.period] + " return");

    // Group headers: name, then the cap-weighted group return when it fits.
    svg.selectAll("text.grp").data(root.children).join("text").attr("class", "grp")
      .attr("x", (d) => d.x0 + 3).attr("y", (d) => d.y0 + 14)
      .each(function (d) {
        const w = d.x1 - d.x0 - 6, name = d.data.name, r = fmtPct(basketRet(d.data.children.map((c) => c.t), a, b), 1);
        const t = d3.select(this);
        if (w > (name.length + r.length + 2) * 7) { t.text(name + "  "); t.append("tspan").attr("class", "r").text(r); }
        else if (w > name.length * 7) t.text(name);
        else if (w > 40) t.text(name.slice(0, Math.floor(w / 7.5)) + "…");
      });

    const leaf = svg.selectAll("g.leaf").data(root.leaves()).join("g").attr("class", "leaf")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);
    leaf.append("rect").attr("class", "cell")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0)).attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("fill", (d) => fillFor(col, d.data.r))
      .on("mousemove", (evt, d) => {
        const t = d.data.t;
        showTip(evt, `<b>${t}</b> · ${D.tickers[t].name}<br><span class="g">${d.data.g}</span>` +
          row("Close " + DATES[b], fmtPx(close(t, b))) +
          row(PERIOD_LABEL[state.period], fmtPct(d.data.r)) +
          row("Market cap", fmtCap(cap(t, b))) +
          row("Weight in view", (d.value / root.value * 100).toFixed(1) + "%"));
      })
      .on("mouseleave", hideTip);

    leaf.each(function (d) {
      const w = d.x1 - d.x0, h = d.y1 - d.y0;
      if (w < 26 || h < 14) return;
      const ink = inkOn(fillFor(col, d.data.r));
      const fs = Math.max(9, Math.min(34, Math.sqrt(w * h) / 4.2, w / (d.data.t.length * 0.7)));
      const showPct = h > fs * 2.3 && w > 40;
      const g = d3.select(this).append("g").attr("pointer-events", "none").attr("fill", ink).attr("text-anchor", "middle");
      g.append("text").attr("class", "tk").attr("x", w / 2).attr("y", h / 2 + (showPct ? -fs * 0.1 : fs * 0.35))
        .attr("font-size", fs).text(d.data.t);
      if (showPct) g.append("text").attr("class", "pc").attr("x", w / 2).attr("y", h / 2 + fs * 0.85)
        .attr("font-size", Math.max(10, fs * 0.5)).text(fmtPct(d.data.r));
    });

    const m = Math.round(col.max * 100);
    document.getElementById("scale").innerHTML =
      `<span>−${m}%</span><span class="bar" style="background:linear-gradient(90deg,${col(-col.max)},${col(0)},${col(col.max)})"></span><span>+${m}%</span>`;
    document.getElementById("mapTitle").textContent = UNIVERSE_LABEL[state.universe] + ", " + PERIOD_LABEL[state.period] + " to " + DATES[b];
    document.getElementById("mapNote").textContent = "Tile size is market cap on " + DATES[b] + "; colour is the price return from the close of " +
      DATES[a] + ". Group headers show the cap-weighted group return. " +
      (TOUCH ? "Tap a tile for details." : "Hover a tile for details.");
  }

  // ---------- line chart ----------
  function renderLine(b) {
    const el = document.getElementById("line");
    const p = state.period === "1D" || state.period === "1W" ? "1M" : state.period;
    const a = startIdx(p, b), idx = d3.range(a, b + 1);
    const present = uniqTickers(state.universe).filter((t) => cap(t, a) != null);
    const c0 = d3.sum(present, (t) => cap(t, a));
    const series = [{ key: "Basket", name: UNIVERSE_LABEL[state.universe] + " basket (cap-weighted)",
      vals: idx.map((i) => d3.sum(present, (t) => cap(t, i) ?? cap(t, a)) / c0 * 100) }]
      .concat(BENCH_FOR[state.universe].filter((t) => D.bench[t]).map((t) => {
        const cl = D.bench[t].close, p0 = cl[a];
        return { key: t, name: D.bench[t].name, vals: idx.map((i) => cl[i] != null && p0 ? cl[i] / p0 * 100 : null) };
      }));
    series.forEach((s, k) => { s.color = C.series[k]; });

    const W = el.clientWidth, narrow = W < 700, H = narrow ? 280 : 340, m = { t: 12, r: narrow ? 64 : 130, b: 28, l: 44 };
    const xs = d3.scaleTime().domain([parse(DATES[a]), parse(DATES[b])]).range([m.l, W - m.r]);
    const ys = d3.scaleLinear().domain(d3.extent(series.flatMap((s) => s.vals.filter((v) => v != null)).concat([100]))).nice().range([H - m.b, m.t]);

    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", "Indexed performance, 100 at " + DATES[a]);
    svg.append("g").attr("class", "gridl").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(ys).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(xs).ticks(narrow ? 3 : 7).tickFormat(d3.timeFormat(p === "1M" ? "%-d %b" : "%b %Y")).tickSizeOuter(0));
    svg.append("g").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(ys).ticks(5).tickSize(0).tickPadding(8)).call((g) => g.select(".domain").remove());
    svg.append("line").attr("class", "base").attr("x1", m.l).attr("x2", W - m.r).attr("y1", ys(100)).attr("y2", ys(100));

    const line = d3.line().defined((v) => v != null).x((v, k) => xs(parse(DATES[idx[k]]))).y((v) => ys(v));
    svg.selectAll("path.s").data(series).join("path").attr("class", "s").attr("fill", "none")
      .attr("stroke", (s) => s.color).attr("stroke-width", (s) => s.key === "Basket" ? 3 : 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", (s) => line(s.vals));

    // Direct end labels, nudged apart so they never overlap.
    const last = (s) => s.vals[s.vals.length - 1];
    const ends = series.map((s) => ({ s, y: ys(last(s)) })).sort((x, y) => x.y - y.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    svg.selectAll("text.lbl").data(ends).join("text").attr("class", "lbl")
      .attr("x", W - m.r + 8).attr("y", (e) => e.y + 4).attr("fill", (e) => e.s.color)
      .style("font-family", "var(--mono)").attr("font-size", 13).attr("font-weight", (e) => e.s.key === "Basket" ? 700 : 400)
      .text((e) => (narrow ? "" : e.s.key + " ") + fmtPct(last(e.s) / 100 - 1, 1));

    // Crosshair and tooltip.
    const cross = svg.append("line").attr("stroke", C.fg2).attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
    const dots = svg.selectAll("circle.d").data(series).join("circle").attr("r", 5)
      .attr("fill", (s) => s.color).attr("stroke", C.bg).attr("stroke-width", 2).style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", 0).attr("width", W - m.l - m.r).attr("height", H).attr("fill", "transparent")
      .on("mousemove", (evt) => {
        const k = Math.max(0, Math.min(idx.length - 1, d3.bisector((i) => parse(DATES[i])).center(idx, xs.invert(d3.pointer(evt)[0]))));
        const x = xs(parse(DATES[idx[k]]));
        cross.attr("x1", x).attr("x2", x).style("display", null);
        dots.attr("cx", x).attr("cy", (s) => s.vals[k] == null ? -99 : ys(s.vals[k])).style("display", null);
        showTip(evt, `<b>${fmtDate(DATES[idx[k]])}</b>` + series.map((s) =>
          row(`<i style="display:inline-block;width:12px;height:3px;background:${s.color};margin-right:6px;vertical-align:middle"></i>${s.key}`,
            s.vals[k] == null ? "n/a" : fmtPct(s.vals[k] / 100 - 1, 1))).join(""));
      })
      .on("mouseleave", () => { cross.style("display", "none"); dots.style("display", "none"); hideTip(); });

    document.getElementById("legend").innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
    document.getElementById("lineTitle").textContent = UNIVERSE_LABEL[state.universe] + " against benchmarks, " + PERIOD_LABEL[p];
    document.getElementById("lineNote").textContent = "Indexed to 100 at the close of " + DATES[a] +
      ". The basket holds every company in the view, weighted by market cap" + (p !== state.period ? ". Daily and weekly periods show the last month." : ".");
  }

  // ---------- group table ----------
  function renderTable(a, b) {
    const col = colorScale();
    const rows = Object.entries(D.universes[state.universe]).map(([g, ts]) => {
      const rs = ts.map((t) => ({ t, r: ret(t, a, b) })).filter((d) => d.r != null).sort((x, y) => y.r - x.r);
      return { g, n: ts.length, cap: d3.sum(ts, (t) => cap(t, b) || 0), r: basketRet(ts, a, b),
        best: rs[0], worst: rs[rs.length - 1], up: rs.filter((d) => d.r > 0).length };
    }).sort((x, y) => y.cap - x.cap);
    const total = d3.sum(rows, (r) => r.cap);
    const tr = (d) => d ? d.t + " " + fmtPct(d.r, 1) : "n/a";
    document.getElementById("tableTitle").textContent = (state.universe === "ai" ? "By AI layer" : "By sector") + ", " + PERIOD_LABEL[state.period];
    document.getElementById("groupTable").innerHTML =
      "<thead><tr><th>Group</th><th class=num>Companies</th><th class=num>Market cap</th><th class=num>Share</th><th class=num>Return</th>" +
      "<th class=num>Up</th><th>Best</th><th>Worst</th></tr></thead><tbody>" +
      rows.map((r) => `<tr><td><span class="sw" style="background:${fillFor(col, r.r)}"></span>${r.g}</td>` +
        `<td class=num>${r.n}</td><td class=num>${fmtCap(r.cap)}</td><td class=num>${(r.cap / total * 100).toFixed(1)}%</td>` +
        `<td class=num>${fmtPct(r.r)}</td><td class=num>${r.up}/${r.n}</td><td class=mono>${tr(r.best)}</td><td class=mono>${tr(r.worst)}</td></tr>`).join("") +
      "</tbody>";
  }

  // ---------- controls ----------
  const slider = document.getElementById("dateSlider");
  slider.max = String(N - 1);
  function render() {
    const b = state.idx, a = startIdx(state.period, b);
    slider.value = String(b);
    document.getElementById("dateLabel").textContent = fmtDate(DATES[b]);
    document.getElementById("asof").textContent = PERIOD_LABEL[state.period] + " to the close of " + fmtDate(DATES[b]) + " · latest data " + DATES[N - 1];
    document.querySelectorAll("[data-universe]").forEach((x) => x.classList.toggle("on", x.dataset.universe === state.universe));
    document.querySelectorAll("[data-period]").forEach((x) => x.classList.toggle("on", x.dataset.period === state.period));
    C = palette();
    document.getElementById("themeBtn").textContent = isDark() ? "Day mode" : "Night mode";
    renderStats(a, b); renderMap(a, b); renderLine(b); renderTable(a, b);
  }
  const go = (i) => { state.idx = Math.max(1, Math.min(N - 1, i)); render(); };
  document.querySelectorAll("[data-universe]").forEach((x) => x.addEventListener("click", () => { state.universe = x.dataset.universe; savePrefs(); render(); }));
  document.querySelectorAll("[data-period]").forEach((x) => x.addEventListener("click", () => { state.period = x.dataset.period; savePrefs(); render(); }));
  slider.addEventListener("input", () => go(+slider.value));
  document.getElementById("prevDay").addEventListener("click", () => go(state.idx - 1));
  document.getElementById("nextDay").addEventListener("click", () => go(state.idx + 1));
  document.getElementById("latest").addEventListener("click", () => go(N - 1));
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") go(state.idx - 1);
    if (e.key === "ArrowRight") go(state.idx + 1);
  });
  // Redraw when the content width changes (window resize, scrollbar appearing, fonts loading).
  let rt, lastW = 0;
  new ResizeObserver(() => {
    const w = document.getElementById("map").clientWidth;
    if (w !== lastW) { lastW = w; clearTimeout(rt); rt = setTimeout(render, 80); }
  }).observe(document.getElementById("map"));

  // Day / night: day by default; the button switches and remembers the choice.
  document.getElementById("themeBtn").addEventListener("click", () => {
    const t = isDark() ? "day" : "night";
    try { localStorage.setItem("mm-theme", t); } catch (e) { /* ignore */ }
    document.documentElement.dataset.theme = t;
    render();
  });

  document.getElementById("foot").textContent = "Source: " + D.source + ", built " + D.built +
    ". Market cap is current shares outstanding times the close, so past caps ignore buybacks and issuance. Not investment advice.";
  render();
})();
