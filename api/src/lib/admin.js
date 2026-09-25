// Tableau de bord privé (/admin) : audience, actions utiles, liens cassés, messages reçus.
// Rendu côté serveur (aucune dépendance) ; un petit script ajoute les infobulles du graphique.
import { SUBJECTS } from '@cuf/shared/validation';
import { business } from '@cuf/shared/business';
import { escapeHtml as e } from './http.js';

const PERIODS = [7, 30, 90];
const nf = new Intl.NumberFormat('fr-BE');
const pct = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 0 });
const subjectLabel = (v) => SUBJECTS.find((s) => s.value === v)?.label ?? v;

function shortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function dateTime(iso) {
  return new Intl.DateTimeFormat('fr-BE', {
    timeZone: business.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Graduation « propre » de l'axe (0, 5, 10… / 0, 20, 40…). */
function niceMax(max) {
  if (max <= 4) return { top: 4, step: 1 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

/** Histogramme « visites par jour » : barres fines, arrondi de 4 px en haut, écart de 2 px. */
function visitsChart(series) {
  const W = 960;
  const H = 260;
  const pad = { top: 28, right: 12, bottom: 34, left: 44 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(0, ...series.map((d) => d.visitors));
  const { top, step } = niceMax(max);
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v) => pad.top + plotH - (v / top) * plotH;
  const peak = series.reduce((best, d, i) => (d.visitors > (series[best]?.visitors ?? -1) ? i : best), 0);
  const labelEvery = series.length <= 7 ? 1 : series.length <= 31 ? 7 : 14;
  const last = series.length - 1;
  // Le dernier jour est toujours légendé ; une date trop proche de lui est omise (pas de chevauchement).
  const showLabel = (i) => {
    if (i === last) return true;
    if (i % labelEvery !== 0) return false;
    return last - i >= Math.ceil(labelEvery / 2);
  };

  const grid = [];
  for (let v = 0; v <= top; v += step) {
    grid.push(
      `<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
        `<text x="${pad.left - 10}" y="${y(v) + 4}" class="tick" text-anchor="end">${nf.format(v)}</text>`,
    );
  }

  const bars = series
    .map((d, i) => {
      const x = pad.left + i * slot + (slot - barW) / 2;
      const h = (d.visitors / top) * plotH;
      const r = Math.min(4, h, barW / 2);
      const yTop = pad.top + plotH - h;
      const base = pad.top + plotH;
      const path =
        h > 0
          ? `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${base} Z`
          : '';
      const label = `${shortDate(d.date)} : ${nf.format(d.visitors)} visite${d.visitors > 1 ? 's' : ''}, ${nf.format(d.pageviews)} page${d.pageviews > 1 ? 's' : ''} vue${d.pageviews > 1 ? 's' : ''}`;
      const xLabel = showLabel(i)
          ? `<text x="${x + barW / 2}" y="${H - 10}" class="tick" text-anchor="middle">${shortDate(d.date)}</text>`
          : '';
      const peakLabel =
        i === peak && d.visitors > 0
          ? `<text x="${x + barW / 2}" y="${yTop - 8}" class="value" text-anchor="middle">${nf.format(d.visitors)}</text>`
          : '';
      return `<g class="bar" tabindex="0" role="listitem" aria-label="${e(label)}" data-date="${shortDate(d.date)}" data-visits="${d.visitors}" data-views="${d.pageviews}">
        <rect class="hit" x="${pad.left + i * slot}" y="${pad.top}" width="${slot}" height="${plotH}"/>
        ${path ? `<path d="${path}" class="mark"/>` : ''}${peakLabel}${xLabel}</g>`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="list" aria-label="Visites par jour">
    ${grid.join('')}
    <line x1="${pad.left}" x2="${W - pad.right}" y1="${pad.top + plotH}" y2="${pad.top + plotH}" class="axis"/>
    ${bars}
  </svg>`;
}

function table(headers, rows, empty = 'Rien à signaler pour cette période.') {
  if (!rows.length) return `<p class="empty">${e(empty)}</p>`;
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

export function renderDashboard({ days, stats, broken, messages, consents, mailEnabled }) {
  const since = Date.now() - days * 86_400_000;
  const recent = messages.filter((m) => Date.parse(m.ts) >= since);
  const received = recent.filter((m) => !m.spam).length;
  const spam = recent.filter((m) => m.spam).length;
  const recentConsents = consents.filter((c) => Date.parse(c.ts) >= since);
  const latestById = new Map();
  for (const c of recentConsents) latestById.set(c.id, c);
  const consentTotal = latestById.size;
  const consentYes = [...latestById.values()].filter((c) => c.analytics).length;
  const total = (list) => list.reduce((s, x) => s + x.count, 0) || 1;

  const kpis = [
    { label: 'Visites', value: nf.format(stats.totals.visitors), hint: 'visiteurs uniques par jour, additionnés' },
    { label: 'Pages vues', value: nf.format(stats.totals.pageviews) },
    { label: 'Appels', value: nf.format(stats.actions.call), hint: 'clics sur un numéro de téléphone' },
    { label: 'Itinéraires', value: nf.format(stats.actions.directions), hint: 'clics sur « Itinéraire »' },
    { label: 'Messages reçus', value: nf.format(received), hint: spam ? `${nf.format(spam)} spam écarté${spam > 1 ? 's' : ''}` : 'aucun spam' },
    {
      label: 'Mesure d’audience acceptée',
      value: consentTotal ? pct.format(consentYes / consentTotal) : '—',
      hint: consentTotal ? `${nf.format(consentYes)} sur ${nf.format(consentTotal)} choix` : 'aucun choix enregistré',
    },
  ];

  const status = (m) =>
    m.spam ? '<span class="badge badge--spam">spam écarté</span>' : m.review ? '<span class="badge badge--review">à vérifier</span>' : m.emailed ? '<span class="badge">envoyé par e-mail</span>' : '<span class="badge">enregistré</span>';

  return `<!doctype html>
<html lang="fr-BE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Tableau de bord — ${e(business.name)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root {
    color-scheme: light;
    --surface: #faf8f5; --card: #ffffff; --ink: #271a00; --ink-strong: #121516; --muted: #6b6457;
    --line: rgba(39, 26, 0, 0.12); --grid: #ece9e2; --series: #12805c; --series-hover: #0d6a4b;
    --chip: #f1eee8; --chip-on: #23291b; --chip-on-ink: #faf8f5; --warn-bg: #fff4d6; --warn: #6b4e00; --bad-bg: #fbeeeb; --bad: #9b2c1f;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --surface: #141612; --card: #1a1c17; --ink: #efece4; --ink-strong: #ffffff; --muted: #b9b4a8;
      --line: rgba(239, 236, 228, 0.14); --grid: #2b2e27; --series: #2f9e78; --series-hover: #45b28b;
      --chip: #23261f; --chip-on: #efece4; --chip-on-ink: #141612; --warn-bg: #3a3014; --warn: #f3d27a; --bad-bg: #3a1c17; --bad: #f2a497;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface); color: var(--ink); font: 15px/1.55 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.011em; }
  a { color: inherit; }
  .wrap { width: min(100% - 40px, 1200px); margin: 0 auto; padding: 40px 0 80px; }
  header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 28px; }
  h1 { margin: 0; font: 300 clamp(28px, 4vw, 40px)/1.1 Newsreader, Georgia, serif; letter-spacing: -0.01em; color: var(--ink-strong); }
  h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: var(--ink-strong); }
  .muted, .hint { color: var(--muted); }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .filters a { display: inline-flex; align-items: center; min-height: 36px; padding: 0 16px; border-radius: 40px; background: var(--chip); text-decoration: none; font-size: 14px; font-weight: 500; }
  .filters a[aria-current="page"] { background: var(--chip-on); color: var(--chip-on-ink); }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 12px; }
  .kpi { background: var(--card); border-radius: 12px; padding: 20px; }
  .kpi__label { margin: 0; font-size: 13px; color: var(--muted); }
  .kpi__value { margin: 6px 0 2px; font-size: 32px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink-strong); }
  .kpi__hint { margin: 0; font-size: 12px; color: var(--muted); }
  .card { background: var(--card); border-radius: 12px; padding: 24px; margin-bottom: 12px; }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
  .grid-2 .card { margin-bottom: 0; }
  .grid-2 + .card, .grid-2 + .grid-2 { margin-top: 12px; }
  .chart-box { position: relative; margin-top: 16px; }
  .chart { width: 100%; height: auto; display: block; overflow: visible; }
  .chart .grid { stroke: var(--grid); stroke-width: 1; }
  .chart .axis { stroke: var(--muted); stroke-width: 1; opacity: 0.5; }
  .chart .tick { fill: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .chart .value { fill: var(--ink-strong); font-size: 12px; font-weight: 600; }
  .chart .mark { fill: var(--series); transition: fill 120ms; }
  .chart .hit { fill: transparent; }
  .chart .bar { outline: none; cursor: default; }
  .chart .bar:hover .mark, .chart .bar:focus .mark { fill: var(--series-hover); }
  .chart .bar:focus-visible .hit { stroke: var(--series); stroke-width: 1; }
  .tooltip { position: absolute; pointer-events: none; transform: translate(-50%, calc(-100% - 10px)); background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font-size: 13px; white-space: nowrap; box-shadow: 0 6px 24px rgba(0,0,0,.08); }
  .tooltip strong { display: block; font-size: 15px; color: var(--ink-strong); }
  details { margin-top: 12px; }
  summary { cursor: pointer; color: var(--muted); font-size: 14px; }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px; }
  th, td { text-align: left; padding: 10px 12px 10px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  thead th { font-size: 12px; font-weight: 500; color: var(--muted); }
  tbody th { font-weight: 500; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { margin: 12px 0 0; color: var(--muted); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: var(--chip); font-size: 12px; white-space: nowrap; }
  .badge--review { background: var(--warn-bg); color: var(--warn); }
  .badge--spam { background: var(--bad-bg); color: var(--bad); }
  code { font-size: 12px; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
  .btn { display: inline-flex; align-items: center; min-height: 36px; padding: 0 16px; border-radius: 40px; border: 1px solid var(--line); text-decoration: none; font-size: 14px; font-weight: 500; }
  .notice { margin: 0 0 12px; padding: 12px 16px; border-radius: 8px; background: var(--warn-bg); color: var(--warn); font-size: 14px; }
  footer { margin-top: 32px; font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <p class="muted" style="margin:0 0 4px">${e(business.name)}</p>
      <h1>Tableau de bord</h1>
    </div>
    <a class="btn" href="/">Voir le site</a>
  </header>

  <nav class="filters" aria-label="Période">
    ${PERIODS.map((p) => `<a href="?jours=${p}"${p === days ? ' aria-current="page"' : ''}>${p} derniers jours</a>`).join('')}
  </nav>

  ${mailEnabled ? '' : '<p class="notice">L’envoi d’e-mails n’est pas configuré (SMTP) : les messages du formulaire sont enregistrés ici, pensez à les consulter.</p>'}

  <section class="kpis" aria-label="Chiffres clés">
    ${kpis
      .map(
        (k) => `<div class="kpi"><p class="kpi__label">${e(k.label)}</p><p class="kpi__value">${e(k.value)}</p>${k.hint ? `<p class="kpi__hint">${e(k.hint)}</p>` : ''}</div>`,
      )
      .join('')}
  </section>

  <section class="card" aria-labelledby="visites">
    <h2 id="visites">Visites par jour</h2>
    <p class="muted" style="margin:0">Visiteurs uniques par jour (anonymes, sans cookie), ${days} derniers jours.</p>
    <div class="chart-box" data-chart>${visitsChart(stats.series)}<div class="tooltip" hidden data-tooltip></div></div>
    <details>
      <summary>Voir les données du graphique</summary>
      ${table(
        ['Jour', 'Visites', 'Pages vues'],
        [...stats.series].reverse().map((d) => [e(shortDate(d.date)), nf.format(d.visitors), nf.format(d.pageviews)]),
      )}
    </details>
  </section>

  <div class="grid-2">
    <section class="card" aria-labelledby="pages">
      <h2 id="pages">Pages les plus vues</h2>
      ${table(['Page', 'Vues'], stats.pages.map((p) => [`<code>${e(p.name)}</code>`, nf.format(p.count)]))}
    </section>
    <section class="card" aria-labelledby="sources">
      <h2 id="sources">Provenance des visites</h2>
      ${table(['Source', 'Visites', 'Part'], stats.sources.map((s) => [e(s.name), nf.format(s.count), pct.format(s.count / total(stats.sources))]))}
    </section>
  </div>

  <div class="grid-2">
    <section class="card" aria-labelledby="appareils">
      <h2 id="appareils">Appareils</h2>
      ${table(['Appareil', 'Visites', 'Part'], stats.devices.map((d) => [e(d.name), nf.format(d.count), pct.format(d.count / total(stats.devices))]))}
    </section>
    <section class="card" aria-labelledby="actions">
      <h2 id="actions">Actions des visiteurs</h2>
      ${table(
        ['Action', 'Nombre'],
        [
          ['Appel (clic sur un numéro)', stats.actions.call],
          ['Itinéraire', stats.actions.directions],
          ['E-mail', stats.actions.email],
          ['Formulaire envoyé', stats.actions.contact_sent],
          ['Photo agrandie', stats.actions.photo_open],
          ['Filtre de la galerie', stats.actions.gallery_filter],
          ['Lien externe (Facebook…)', stats.actions.outbound],
        ].map(([a, n]) => [e(a), nf.format(n)]),
      )}
      ${stats.campaigns.length ? `<h2 style="margin-top:20px">Campagnes (liens utm)</h2>${table(['Campagne', 'Visites'], stats.campaigns.map((c) => [e(c.name), nf.format(c.count)]))}` : ''}
    </section>
  </div>

  <section class="card" aria-labelledby="liens" style="margin-top:12px">
    <h2 id="liens">Liens cassés à réparer</h2>
    <p class="muted" style="margin:0">Adresses introuvables demandées par des visiteurs, avec une piste de correction.</p>
    ${table(
      ['Adresse', 'Type', 'Fois', 'Dernière fois', 'Venant de', 'Correction proposée'],
      broken.map((b) => [
        `<code>${e(b.url)}</code>`,
        b.kind === 'image' ? 'image' : 'page',
        nf.format(b.count),
        e(dateTime(b.last)),
        b.ref ? `<code>${e(b.ref)}</code>` : '—',
        e(b.fix),
      ]),
      'Aucun lien cassé signalé : bravo !',
    )}
  </section>

  <section class="card" aria-labelledby="messages">
    <div class="actions">
      <h2 id="messages">Derniers messages</h2>
      <a class="btn" href="/admin/messages.csv">Exporter en CSV (Excel)</a>
    </div>
    ${table(
      ['Reçu le', 'Nom', 'Contact', 'Demande', 'Message', 'Statut'],
      recent
        .slice(-50)
        .reverse()
        .map((m) => [
          e(dateTime(m.ts)),
          e(m.nom),
          `<a href="mailto:${e(m.email)}">${e(m.email)}</a>${m.telephone ? `<br><a href="tel:${e(m.telephone.replace(/[^\d+]/g, ''))}">${e(m.telephone)}</a>` : ''}`,
          `${e(subjectLabel(m.sujet))}${m.date ? `<br><span class="muted">pour le ${e(m.date.split('-').reverse().join('/'))}</span>` : ''}`,
          e(m.message.length > 220 ? `${m.message.slice(0, 220)}…` : m.message),
          status(m),
        ]),
      'Aucun message sur cette période.',
    )}
  </section>

  <footer>
    Données anonymes et purgées automatiquement (messages : 12 mois, audience : 13 mois, liens cassés : 6 mois),
    conformément à la politique de confidentialité du site.
  </footer>
</div>
<script src="/admin/dashboard.js" defer></script>
</body>
</html>`;
}

/** Export CSV compatible Excel (séparateur « ; », UTF-8 avec BOM). */
export function messagesCsv(messages) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const head = ['Reçu le', 'Nom', 'E-mail', 'Téléphone', 'Demande', 'Date souhaitée', 'Message', 'Statut'];
  const rows = messages
    .slice()
    .reverse()
    .map((m) =>
      [
        dateTime(m.ts),
        m.nom,
        m.email,
        m.telephone,
        subjectLabel(m.sujet),
        m.date,
        m.message,
        m.spam ? 'spam écarté' : m.review ? 'à vérifier' : m.emailed ? 'envoyé par e-mail' : 'enregistré',
      ]
        .map(cell)
        .join(';'),
    );
  return `﻿${[head.map(cell).join(';'), ...rows].join('\r\n')}\r\n`;
}

/** Infobulles du graphique (valeur en premier, date ensuite ; clavier = survol). */
export const dashboardScript = `(() => {
  const box = document.querySelector('[data-chart]');
  if (!box) return;
  const tip = box.querySelector('[data-tooltip]');
  const nf = new Intl.NumberFormat('fr-BE');
  function show(bar) {
    const visits = Number(bar.dataset.visits);
    const views = Number(bar.dataset.views);
    const strong = document.createElement('strong');
    strong.textContent = nf.format(visits) + (visits > 1 ? ' visites' : ' visite');
    const small = document.createElement('span');
    small.textContent = bar.dataset.date + ' · ' + nf.format(views) + (views > 1 ? ' pages vues' : ' page vue');
    tip.replaceChildren(strong, small);
    const hit = bar.querySelector('.hit').getBoundingClientRect();
    const mark = bar.querySelector('.mark');
    const top = mark ? mark.getBoundingClientRect().top : hit.bottom;
    const rect = box.getBoundingClientRect();
    tip.style.left = (hit.left + hit.width / 2 - rect.left) + 'px';
    tip.style.top = (top - rect.top) + 'px';
    tip.hidden = false;
  }
  const hide = () => { tip.hidden = true; };
  box.querySelectorAll('.bar').forEach((bar) => {
    bar.addEventListener('pointerenter', () => show(bar));
    bar.addEventListener('focus', () => show(bar));
    bar.addEventListener('pointerleave', hide);
    bar.addEventListener('blur', hide);
  });
})();`;
