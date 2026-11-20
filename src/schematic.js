// Hand-drawn SVG schematic: the male genitalia in side view (front of the body to the right) — abdominal
// wall and inguinal canal, spermatic cord, testis and epididymis in the scrotum, penis with corpora, glans,
// prepuce and urethral meatus — plus a context panel (spread, Doppler flow, hypothalamic–pituitary–testicular
// axis or the erection pathway). Pure rendering from a plain description produced by the model.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const f1 = (x) => x.toFixed(1);
const fmt = (lang, v, d) => new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);

const BASE = { x: 150, y: 146 }; // root of the penis at the pubis
const POS = { scrotal: [186, 236], highScrotal: [180, 196], inguinal: [128, 126], abdominal: [96, 98] };

/** Centre line of the penis: N points from the root, base angle a0 (deg, + = up) and total curvature (deg, + = dorsal). */
function shaft(L, a0, curv) {
  const pts = []; const N = 24;
  let x = BASE.x; let y = BASE.y;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const th = ((a0 + curv * s) * Math.PI) / 180;
    pts.push({ x, y, th });
    x += Math.cos(th) * L / N; y -= Math.sin(th) * L / N;
  }
  return pts;
}
/** Polygon between two offsets (+ = dorsal side) of a centre line. */
function band(pts, o1, o2) {
  const a = pts.map((p) => [p.x - Math.sin(p.th) * o1, p.y - Math.cos(p.th) * o1]);
  const b = pts.map((p) => [p.x - Math.sin(p.th) * o2, p.y - Math.cos(p.th) * o2]).reverse();
  return 'M' + [...a, ...b].map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L') + 'Z';
}
const along = (pts, s, off = 0) => { const p = pts[Math.round(clamp(s, 0, 1) * (pts.length - 1))]; return { x: p.x - Math.sin(p.th) * off, y: p.y - Math.cos(p.th) * off, th: p.th }; };

function testisSvg(d, T, parts, labels) {
  const t = d.testis || {};
  const pos = t.pos && t.pos !== 'scrotal' ? t.pos : 'scrotal';
  const [cx0, cy0] = POS[pos];
  const torsion = t.torsion;
  const cx = cx0; const cy = torsion ? cy0 - 16 : cy0;
  const sc = (d.child ? 0.62 : 1) * (t.small ? 0.68 : 1) * (pos === 'inguinal' || pos === 'abdominal' ? 0.6 : 1);
  const rx = 25 * sc; const ry = 34 * sc;
  // scrotum (smaller and empty-looking when the testis is not in it)
  const full = pos === 'scrotal';
  parts.push(`<path class="scrotum" d="M150 168 C ${full ? 228 : 214} 166 ${full ? 240 : 222} 200 ${full ? 236 : 220} ${full ? 252 : 226} C ${full ? 232 : 216} ${full ? 300 : 262} ${full ? 160 : 162} ${full ? 304 : 266} 150 ${full ? 270 : 238} Z"/>`);
  labels.push(['scrotum', 154, full ? 296 : 258]);
  // cord from the internal ring through the canal into the scrotum
  const cordEnd = t.removed ? [150, 150] : [cx - 2, cy - ry];
  parts.push(`<path class="cord" d="M100 92 Q126 114 150 140 Q${f1((150 + cordEnd[0]) / 2 + 8)} ${f1((140 + cordEnd[1]) / 2)} ${f1(cordEnd[0])} ${f1(cordEnd[1])}"/>`);
  if (t.varicocele > 0.05 && !t.removed) {
    const n = Math.round(2 + t.varicocele * 5);
    for (let i = 0; i < n; i++) {
      const dx = -12 + i * 6;
      parts.push(`<path class="vein" d="M${f1(176 + dx)} 172 q6 6 0 12 q-6 6 0 12 q6 6 0 ${f1(Math.max(6, cy - ry - 196 + 4))}"/>`);
    }
    labels.push(['varicocele', 6, 186, false, 160]);
  }
  if (t.coil) parts.push(`<path class="coil" d="M86 54 c4 -6 8 6 12 0 c4 -6 8 6 12 0 c4 -6 8 6 12 0"/>`);
  if (t.communicating) parts.push(`<path class="processus" d="M100 92 Q126 114 150 140 Q172 160 ${f1(cx)} ${f1(cy - ry - 4)}"/>`);
  if (torsion) {
    const loops = Math.max(1, Math.round(torsion.deg / 360 * 2));
    for (let i = 0; i < loops; i++) parts.push(`<ellipse class="twist" cx="${f1(cx - 4)}" cy="${f1(cy - ry - 10 - i * 7)}" rx="9" ry="3.5"/>`);
    labels.push(['torsion', 6, cy - ry - 8, false, cx - 14]);
  }
  if (t.removed) {
    parts.push(`<ellipse class="testis removed" cx="${cx0}" cy="${cy0}" rx="${f1(rx)}" ry="${f1(ry)}"/>`);
    labels.push(['removed', 236, cy0 + 4, true]);
  } else {
    // tunica vaginalis with hydrocele fluid
    if (t.hydrocele > 5) {
      const ex = Math.cbrt(t.hydrocele) * 2.6;
      parts.push(`<ellipse class="hydrocele" cx="${f1(cx + 2)}" cy="${f1(cy + 2)}" rx="${f1(rx + ex)}" ry="${f1(ry + ex * 0.9)}"/>`);
      labels.push(['hydrocele', 238, cy + ry + ex * 0.6]);
    }
    const ang = torsion ? 70 : 0;
    parts.push(`<g transform="rotate(${ang} ${f1(cx)} ${f1(cy)})">`);
    // epididymis behind (posterior = left)
    parts.push(`<path class="epididymis${t.inflamed ? ' inflamed' : ''}" d="M${f1(cx - rx * 0.6)} ${f1(cy - ry * 0.95)} q${f1(-rx * (t.inflamed ? 1.2 : 0.75))} ${f1(ry * 0.9)} ${f1(-rx * 0.1)} ${f1(ry * 1.9)}" stroke-width="${f1((t.inflamed ? 13 : 8) * sc)}"/>`);
    parts.push(`<ellipse class="testis" cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}"/>`);
    if (torsion || t.isch > 0) parts.push(`<ellipse class="isch" cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" opacity="${f1(clamp((torsion ? torsion.isch : t.isch) * 0.9, 0, 0.9))}"/>`);
    if (t.tumour) {
      const r = clamp(t.tumour.size * 4.2 * sc, 3, rx * 0.95);
      parts.push(`<circle class="gct h-${t.tumour.hist}" cx="${f1(cx + rx * 0.15)}" cy="${f1(cy + ry * 0.1)}" r="${f1(r)}"/>`);
    }
    if (t.appendixTorsion) parts.push(`<circle class="bluedot" cx="${f1(cx + rx * 0.4)}" cy="${f1(cy - ry * 0.95)}" r="4.5"/>`);
    if (t.fixed) for (const k of [-1, 1]) parts.push(`<path class="stitch" d="M${f1(cx + k * rx)} ${f1(cy - 4)} l${k * 6} 4 l${-k * 6} 4"/>`);
    if (t.scar === 'sparing') parts.push(`<path class="scarline" d="M${f1(cx - 6)} ${f1(cy - ry * 0.3)} l12 0"/>`);
    parts.push('</g>');
    if (t.inflamed) labels.push(['epididymitis', 236, cy - 6]);
    if (t.appendixTorsion) labels.push(['appendix', 236, cy - ry]);
    if (t.obstruction) parts.push(`<path class="block" d="M136 132 l10 10 M146 132 l-10 10"/>`), labels.push(['obstruction', 94, 150]);
  }
  if (t.scar === 'inguinal' || t.scar === 'subinguinal') parts.push(`<path class="scarline" d="M${t.scar === 'inguinal' ? 124 : 138} ${t.scar === 'inguinal' ? 118 : 152} l22 14"/>`);
  if (t.scar === 'scrotal') parts.push(`<path class="scarline" d="M196 288 l18 -6"/>`);
  if (t.scar === 'laparoscopic') for (const [x, y] of [[60, 70], [76, 46], [100, 60]]) parts.push(`<circle class="port" cx="${x}" cy="${y}" r="3"/>`);
  if (pos !== 'scrotal') labels.push([pos === 'abdominal' ? 'testisAbdominal' : pos === 'inguinal' ? 'testisInguinal' : 'testisHigh', 6, cy + (pos === 'highScrotal' ? 4 : 26)]);
  else if (!t.removed) labels.push(['testis', 6, cy + 8, false, cx - rx]);
  if (!t.removed && pos === 'scrotal') labels.push(['epididymisLab', 6, cy - 22, false, cx - rx * 1.1]);
  if (d.bilateral) labels.push(['bilateral', 6, 324]);
}

function penisSvg(d, T, parts, labels) {
  const p = d.penis || {};
  if (p.amputated === 'total') {
    parts.push(`<path class="skin stump" d="M150 136 q8 10 0 20"/><circle class="meatus" cx="168" cy="314" r="3.5"/>`);
    labels.push(['urethrostomy', 176, 318]);
    return null;
  }
  const L = 132 * (d.child ? 0.62 : 1) * (p.length ?? 1);
  const rig = p.rigidity ?? (p.erect ? 1 : 0.15);
  const a0 = p.rigidity !== undefined ? -48 + 75 * rig : p.erect ? 8 : -14;
  const pts = shaft(L, a0, p.curvature ?? 0);
  const h = d.child ? 11 : 16;
  parts.push(`<path class="skin" d="${band(pts, h, -h)}"/>`);
  parts.push(`<path class="cavernosa" d="${band(pts.slice(0, -2), h - 2.5, -2)}"/>`);
  parts.push(`<path class="spongiosum" d="${band(pts, -4, -h + 2.5)}"/>`);
  if (p.prosthesis) parts.push(`<path class="prosthesis" d="${band(pts.slice(1, -3), h - 6, 3)}"/>`);
  if (p.vacuum) parts.push(`<path class="vacuum" d="${band(pts.slice(2), h + 6, -h - 6)}"/>`);
  if (p.plaque) { const q = pts.slice(9, 14); parts.push(`<path class="plaque" d="${band(q, h - 1, h - 6)}"/>`); labels.push(['plaque', along(pts, 0.48, h + 18).x, along(pts, 0.48, h + 18).y - 4]); }
  if (p.graft) { const q = pts.slice(9, 14); parts.push(`<path class="graft" d="${band(q, h - 1, h - 6)}"/>`); }
  const tip = pts[pts.length - 1];
  const gx = tip.x + Math.cos(tip.th) * 8; const gy = tip.y - Math.sin(tip.th) * 8;
  const rot = (-tip.th * 180) / Math.PI;
  const amp = p.amputated === 'partial';
  if (!amp) {
    const sw = p.prepuce === 'paraphimosis' ? 1.3 : 1;
    parts.push(`<ellipse class="glans${p.ischaemia > 0.2 ? ' isch' : ''}" cx="${f1(gx)}" cy="${f1(gy)}" rx="${f1(15 * sw * (d.child ? 0.7 : 1))}" ry="${f1((h + 2) * sw)}" transform="rotate(${f1(rot)} ${f1(gx)} ${f1(gy)})"/>`);
    if (p.ls) for (const [dx, dy] of [[-4, -6], [3, 5], [-8, 4]]) parts.push(`<circle class="ls" cx="${f1(gx + dx)}" cy="${f1(gy + dy)}" r="4"/>`);
    // prepuce
    const pre = p.prepuce ?? 'normal';
    if (pre === 'normal' || pre === 'tight' || pre === 'hooded') {
      const ext = pre === 'tight' ? 18 : 2;
      const q = [...pts.slice(-5)];
      for (let i = 1; i <= 4; i++) { const last = q[q.length - 1]; q.push({ x: last.x + Math.cos(last.th) * (6 + ext / 4), y: last.y - Math.sin(last.th) * (6 + ext / 4), th: last.th }); }
      parts.push(`<path class="prepuce${pre === 'tight' ? ' tight' : ''}" d="${band(q, h + 3, pre === 'hooded' ? 2 : -h - 3)}"/>`);
      if (pre === 'tight') { const e = q[q.length - 1]; parts.push(`<circle class="pinhole" cx="${f1(e.x + Math.cos(e.th) * 2)}" cy="${f1(e.y - Math.sin(e.th) * 2)}" r="2"/>`); labels.push(['phimosis', e.x + 6, e.y - 26]); }
    }
    if (pre === 'paraphimosis') { const r1 = along(pts, 0.94, 0); parts.push(`<ellipse class="ring" cx="${f1(r1.x)}" cy="${f1(r1.y)}" rx="5" ry="${f1(h + 5)}" transform="rotate(${f1(rot)} ${f1(r1.x)} ${f1(r1.y)})"/>`); labels.push(['paraphimosis', gx - 10, gy - h - 30]); }
    if (pre === 'circumcised') labels.push(['circumcised', gx - 30, gy - h - 26]);
  } else {
    parts.push(`<ellipse class="stump" cx="${f1(tip.x)}" cy="${f1(tip.y)}" rx="4" ry="${h}" transform="rotate(${f1(rot)} ${f1(tip.x)} ${f1(tip.y)})"/>`);
    labels.push(['partial', tip.x + 10, tip.y - h - 10]);
  }
  // urethral meatus
  const m = p.meatus ?? 'normal';
  const mpos = { normal: [1.07, 0], stenosis: [1.07, 0], distal: [0.9, -h], midshaft: [0.55, -h], proximal: [0.06, -h], epispadias: [0.6, h] }[m];
  let mx; let my;
  if (amp) { mx = tip.x; my = tip.y; } else if (mpos[0] > 1) { mx = gx + Math.cos(tip.th) * 15; my = gy - Math.sin(tip.th) * 15; } else { const a = along(pts, mpos[0], mpos[1]); mx = a.x; my = a.y; }
  parts.push(`<circle class="meatus${m === 'stenosis' ? ' stenosis' : ''}" cx="${f1(mx)}" cy="${f1(my)}" r="${m === 'stenosis' ? 2 : 3.5}"/>`);
  if (!['normal'].includes(m)) labels.push([m === 'stenosis' ? 'meatalStenosis' : 'meatus', mx + (m === 'epispadias' ? 0 : m === 'stenosis' ? 10 : 6), my + (m === 'epispadias' ? -22 : m === 'stenosis' ? 30 : 22)]);
  // tumour on the glans
  if (p.lesion) {
    const r = clamp(p.lesion.size * 5, 4, 26);
    const lx = amp ? tip.x : gx; const ly = amp ? tip.y : gy - 4;
    parts.push(`<circle class="pen-tumour" cx="${f1(lx)}" cy="${f1(ly)}" r="${f1(r)}"/>`);
    if (p.lesion.size > 2.5) parts.push(`<path class="pen-tumour" d="${band(pts.slice(-8), h - 2, -h + 2)}" opacity=".7"/>`);
    labels.push(['penileTumour', lx - 20, ly - r - 10]);
  }
  if (!p.plaque) labels.push(['cavernosa', along(pts, 0.3, h + 14).x - 24, along(pts, 0.3, h + 14).y - 6]);
  return { pts, tip };
}

function panelSvg(d, T, lang, x0) {
  const P = T.ui.gen;
  const out = [];
  const title = (k, y = 58) => out.push(`<text class="region" x="${x0}" y="${y}">${esc(P.panel[k])}</text>`);
  if (d.panel === 'mets') {
    title('mets');
    const items = d.penileMode ? [['inguinal', d.nodes?.inguinal ?? 0], ['pelvic', d.nodes?.pelvic ?? 0], ['distant', d.mets?.lung ?? 0]]
      : [['rp', d.nodes?.rp ?? 0], ['lung', d.mets?.lung ?? 0], ['liver', d.mets?.liver ?? 0], ['brain', d.mets?.brain ?? 0]];
    items.forEach(([k, v], i) => {
      const y = 82 + i * 28;
      out.push(`<circle class="met-dot" cx="${x0 + 8}" cy="${y}" r="8" opacity="${f1(0.08 + 0.9 * clamp(v, 0, 1))}"/><text class="lab small" x="${x0 + 22}" y="${y + 4}">${esc(P.site[k])}</text>`);
    });
    if (!d.penileMode && d.nodes?.rpCm > 0.4) out.push(`<text class="lab small" x="${x0 + 22}" y="${82 + 16}">${esc(fmt(lang, d.nodes.rpCm, 1))} cm</text>`);
    const tx = d.chemo ? P.tx[d.chemo] : d.rt ? P.tx.rt : d.rplnd ? P.tx.rplnd : null;
    if (tx) out.push(`<rect class="badge tx" x="${x0}" y="200" width="128" height="26" rx="8"/><text class="lab small" x="${x0 + 64}" y="217" text-anchor="middle">${esc(tx)}</text>`);
    if (d.gyn !== undefined) {
      out.push(`<text class="lab small" x="${x0}" y="250">${esc(d.child ? P.virilisation : P.gynaecomastia)}</text><rect class="meter-bg" x="${x0}" y="256" width="128" height="7" rx="3"/><rect class="meter-fill" x="${x0}" y="256" width="${f1(128 * clamp(d.gyn, 0, 1))}" height="7" rx="3"/>`);
    }
    if (d.rt) out.push(`<rect class="rt-field" x="58" y="10" width="40" height="70" rx="4"/>`);
    if (d.rplnd) out.push(`<path class="scarline" d="M70 14 l0 60"/>`);
  } else if (d.panel === 'doppler') {
    title('doppler');
    const v = clamp(d.flow ?? 100, 0, 200);
    out.push(`<rect class="meter-bg" x="${x0}" y="78" width="128" height="12" rx="4"/><rect class="band" x="${x0 + 128 * 0.35}" y="78" width="${128 * 0.3}" height="12"/><rect class="meter-fill${v < 50 ? ' bad' : ''}" x="${x0}" y="78" width="${f1(128 * v / 200)}" height="12" rx="4"/>`);
    const word = v < 15 ? 'absent' : v < 70 ? 'reduced' : v <= 130 ? 'normal' : 'increased';
    out.push(`<text class="lab val" x="${x0}" y="110">${esc(P.flow[word])}</text>`);
    ['cremaster', 'prehn', 'lie'].forEach((k, i) => { const [a, b] = P.signs[k].split('|'); out.push(`<text class="lab small" x="${x0}" y="${140 + i * 34}">${esc(a)}</text><text class="lab small muted" x="${x0}" y="${153 + i * 34}">${esc(b)}</text>`); });
  } else if (d.panel === 'hpg') {
    title('hpg', 40);
    const h = d.hpg; const y = [60, 128, 206];
    const box = (yy, k, lit) => out.push(`<rect class="axis-box${lit ? '' : ' dim'}" x="${x0}" y="${yy}" width="128" height="28" rx="6"/><text class="lab small" x="${x0 + 64}" y="${yy + 18}" text-anchor="middle">${esc(P.hpgBox[k])}</text>`);
    box(y[0], 'hyp', h.gnrh > 0.3); box(y[1], 'pit', h.lh > 1); box(y[2], 'testis', h.t > 8 || h.fsh > 1);
    const arrow = (x, y1, y2, w, label, val) => out.push(`<line class="axis-arrow" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="${f1(clamp(w, 0.6, 7))}" marker-end="url(#ah)"/><text class="lab small" x="${x + 6}" y="${(y1 + y2) / 2 + 4}">${esc(label)}${val !== undefined ? ' ' + esc(fmt(lang, val, 1)) : ''}</text>`);
    arrow(x0 + 20, y[0] + 28, y[1] - 2, h.gnrh * 2.5, 'GnRH');
    arrow(x0 + 14, y[1] + 28, y[2] - 2, h.lh * 0.6, 'LH', h.lh);
    arrow(x0 + 74, y[1] + 28, y[2] - 2, h.fsh * 0.6, 'FSH', h.fsh);
    out.push(`<path class="feedback" d="M${x0 + 128} ${y[2] + 14} C${x0 + 150} ${y[2]} ${x0 + 150} ${y[0] + 20} ${x0 + 128} ${y[0] + 14}"/><text class="lab small" x="${x0}" y="${y[2] + 48}">${esc(P.testo)} ${esc(fmt(lang, h.t, 1))} nmol/L</text>`);
    if (h.exo) out.push(`<rect class="badge warn" x="${x0}" y="${y[2] + 58}" width="128" height="22" rx="6"/><text class="lab small" x="${x0 + 64}" y="${y[2] + 73}" text-anchor="middle">${esc(P.exogenous)}</text>`);
    if (h.hcg) out.push(`<rect class="badge tx" x="${x0}" y="${y[2] + 58}" width="128" height="22" rx="6"/><text class="lab small" x="${x0 + 64}" y="${y[2] + 73}" text-anchor="middle">${esc(P.hcgTx)}</text>`);
  } else if (d.panel === 'erection') {
    title('erection', 40);
    const e = d.erection;
    const nerve = e.cause !== 'postProstatectomy'; const endo = !['vasculogenic', 'diabetic'].includes(e.cause);
    const rows = [
      ['stimulus', true], ['nerves', nerve], ['no', nerve && endo ? true : 'weak'], ['cgmp', e.path === 'pde5i' && e.started && !e.blocked ? 'boost' : true], ['relax', true],
    ];
    rows.forEach(([k, st], i) => {
      const yy = 52 + i * 34;
      out.push(`<rect class="axis-box${st === 'weak' || st === false ? ' dim' : st === 'boost' ? ' boost' : ''}" x="${x0}" y="${yy}" width="128" height="24" rx="6"/><text class="lab small" x="${x0 + 64}" y="${yy + 16}" text-anchor="middle">${esc(P.path[k])}</text>`);
      if (i < rows.length - 1) out.push(`<line class="axis-arrow" x1="${x0 + 64}" y1="${yy + 24}" x2="${x0 + 64}" y2="${yy + 32}" marker-end="url(#ah)"/>`);
    });
    out.push(`<text class="lab small${e.path === 'pde5i' && e.started ? ' hl' : ''}" x="${x0}" y="${52 + 3 * 34 - 6}" text-anchor="end" dx="-4">PDE5 ✕</text>`);
    if (e.path === 'alprostadil' && e.started) out.push(`<rect class="axis-box boost" x="${x0}" y="226" width="128" height="24" rx="6"/><text class="lab small" x="${x0 + 64}" y="242" text-anchor="middle">${esc(P.path.camp)}</text>`);
    if (e.blocked) out.push(`<rect class="badge warn" x="${x0}" y="260" width="128" height="22" rx="6"/><text class="lab small" x="${x0 + 64}" y="275" text-anchor="middle">${esc(P.nitrates)}</text>`);
  }
  return out.join('');
}

export function renderSchematic(host, d, T, lang, title) {
  const P = T.ui.gen;
  const parts = []; const labels = [];
  parts.push(`<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L8 4L0 8z" class="ah"/></marker></defs>`);
  parts.push(`<rect class="bg" x="0" y="0" width="480" height="340" rx="8"/>`);
  // abdominal wall, pubis and the inguinal canal
  parts.push(`<path class="wall" d="M124 0 L150 0 L150 138 Q146 150 136 152 L118 150 Q126 120 124 0Z"/>`);
  parts.push(`<path class="canal" d="M100 92 Q126 114 150 140"/>`);
  parts.push(`<ellipse class="pubis" cx="136" cy="160" rx="10" ry="8"/>`);
  labels.push(['canal', 6, 84, false, 100]);
  testisSvg(d, T, parts, labels);
  const pen = penisSvg(d, T, parts, labels);
  if (d.penileMode) {
    const ing = d.nodes?.inguinal ?? 0;
    for (const [x, y] of [[112, 168], [104, 180], [118, 184]]) parts.push(`<circle class="node${ing > 0.3 ? ' pos' : ''}${d.nodes?.inguinalTreated ? ' treated' : ''}" cx="${x}" cy="${y}" r="${f1(5 + ing * 4)}"/>`);
    labels.push(['inguinalNodes', 6, 196]);
  }
  // labels
  const lab = labels.map(([k, x, y, val, leaderTo]) => {
    const text = P.lab[k] ?? k;
    const anchorEnd = false;
    const leader = leaderTo !== undefined ? `<line class="leader" x1="${f1(x + text.length * 5.4 + 4)}" y1="${f1(y - 4)}" x2="${f1(leaderTo)}" y2="${f1(y - 4)}"/>` : '';
    return `${leader}<text class="lab small halo${val ? ' val' : ''}" x="${f1(x)}" y="${f1(y)}"${anchorEnd ? ' text-anchor="end"' : ''}>${esc(text)}</text>`;
  }).join('');
  parts.push(lab);
  // badges
  (d.badges || []).slice(0, 3).forEach((b, i) => {
    const v = b.value >= 1000 ? Number(b.value.toPrecision(3)) : b.value; const digits = v < 10 ? 1 : 0;
    const txt = `${P.badge[b.key]} ${fmt(lang, v, digits)}${P.badgeUnit[b.key] ? ' ' + P.badgeUnit[b.key] : ''}`;
    parts.push(`<rect class="badge" x="${158 + i * 128}" y="10" width="122" height="24" rx="12"/><text class="lab val" x="${158 + i * 128 + 61}" y="26" text-anchor="middle">${esc(txt)}</text>`);
  });
  if (d.panel) parts.push(panelSvg(d, T, lang, 342));
  void pen;
  host.innerHTML = `<svg class="schem" viewBox="0 0 480 340" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${parts.join('')}</svg>`;
}
