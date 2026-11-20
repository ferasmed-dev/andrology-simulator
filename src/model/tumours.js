// Testicular germ-cell tumours, Leydig cell tumour and penile carcinoma. Pure functions only.
// Germ-cell and penile simulations are cohort models (expected values): fractions cured, relapsing,
// failing and dead; marker curves are the expected marker level of the cohort.
import { clamp, relax } from './core.js';
import { weibullHazard } from './onco.js';

// ---------------------------------------------------------------------------
// Germ-cell tumours
// ---------------------------------------------------------------------------
export const GCT_STAGES = ['I', 'IIA', 'IIB', 'IIC', 'III'];
/** IGCCCG prognostic group (2021 update uses the same marker cut-offs). Seminoma has no poor group. */
export function igcccg(hist, p) {
  if (hist === 'seminoma') return p.visceral ? 'intermediate' : 'good';
  if (p.visceral || p.afp0 > 10000 || p.hcg0 > 50000 || p.ldh0 > 10) return 'poor';
  if (p.afp0 >= 1000 || p.hcg0 >= 5000 || p.ldh0 >= 1.5) return 'intermediate';
  return 'good';
}
/** 5-year progression-free and overall survival by IGCCCG group (Gillessen et al. 2021). */
export const IGCCCG = {
  seminoma: { good: { pfs: 0.89, os: 0.95 }, intermediate: { pfs: 0.79, os: 0.88 } },
  nsgct: { good: { pfs: 0.89, os: 0.96 }, intermediate: { pfs: 0.75, os: 0.89 }, poor: { pfs: 0.54, os: 0.67 } },
};
/** Number of risk factors for relapse in stage I (seminoma: size > 4 cm, rete testis invasion; NSGCT: LVI). */
export function riskFactors(hist, p) { return hist === 'seminoma' ? (p.size > 4 ? 1 : 0) + (p.rete ? 1 : 0) : (p.lvi ? 1 : 0); }
/** Relapse probability on surveillance after orchiectomy, stage I (Model from EAU-cited series). */
export function stageIRelapse(hist, p) { return hist === 'seminoma' ? [0.12, 0.16, 0.3][riskFactors(hist, p)] : p.lvi ? 0.5 : 0.15; }
/** Recommended treatment after orchiectomy. */
export function gctRecommendation(hist, p) {
  if (p.stage === 'I') {
    if (hist === 'seminoma') return riskFactors(hist, p) === 2 ? 'carboplatin' : 'surveillance';
    return p.lvi ? 'bep1' : 'surveillance';
  }
  if (p.stage === 'IIA' || p.stage === 'IIB') return hist === 'seminoma' ? (p.stage === 'IIA' ? 'rt' : 'bep3') : 'bep3';
  return igcccg(hist, p) === 'good' ? 'bep3' : 'bep4';
}
/** Expected outcome of a treatment: probability of relapse after it and of cure after a relapse (salvage). */
export function gctOutcome(hist, p, tx) {
  const adv = p.stage !== 'I';
  if (!adv) {
    const r0 = stageIRelapse(hist, p);
    const factor = { surveillance: 1, carboplatin: 0.3, rt: 0.25, bep1: 0.06, rplnd: 0.25, bep3: 0.03, bep4: 0.03 }[tx];
    return { relapse: r0 * factor, salvage: 0.95, adequate: true, over: tx === 'bep3' || tx === 'bep4' || (hist === 'seminoma' && tx === 'rt') };
  }
  const grp = p.stage === 'IIA' || p.stage === 'IIB' ? 'good' : igcccg(hist, p);
  const ref = IGCCCG[hist][grp];
  const salvage = (ref.os - ref.pfs) / (1 - ref.pfs);
  const small = p.stage === 'IIA' || p.stage === 'IIB';
  let pfs = ref.pfs; let adequate = true;
  if (small) {
    pfs = { rt: hist === 'seminoma' ? (p.stage === 'IIA' ? 0.95 : 0.89) : 0.6, bep3: 0.95, bep4: 0.96, rplnd: hist === 'seminoma' ? 0.75 : 0.7, carboplatin: 0.8, surveillance: 0.05, bep1: 0.6 }[tx];
    if (tx === 'surveillance' || tx === 'bep1' || (hist === 'seminoma' && tx === 'carboplatin') || (hist === 'nsgct' && tx === 'rt')) adequate = false;
  } else {
    if (tx === 'bep3' && grp !== 'good') { pfs = ref.pfs * 0.85; adequate = false; }
    if (['surveillance', 'carboplatin', 'rt', 'bep1', 'rplnd'].includes(tx)) { pfs = tx === 'surveillance' ? 0.02 : 0.3; adequate = false; }
  }
  return { relapse: 1 - pfs, salvage: small ? 0.9 : salvage, adequate, over: false };
}
/** Untreated median survival (months), Model. */
const UNTREATED_MEDIAN = { seminoma: { I: 30, IIA: 22, IIB: 20, IIC: 14, III: 10 }, nsgct: { I: 18, IIA: 13, IIB: 12, IIC: 9, III: 6 } };
const MET_SHARE = { I: 0, IIA: 0.3, IIB: 0.4, IIC: 0.55, III: 0.75 }; // share of marker production outside the testis (Model)
const T_ORCH = 0.25; const T_TX = 1.5; // months
/** Marker half-lives (months): AFP 5–7 days, hCG 1–3 days. */
export const HALF = { afp: 6 / 30, hcg: 2.5 / 30, ldh: 3 / 30 };
export const MARKER_NORMAL = { afp: 5, hcg: 1, ldh: 1 };
const CAP = { afp: 60000, hcg: 250000, ldh: 14 };
const CAP_SEM = { afp: 0, hcg: 600, ldh: 14 }; // plateau of the untreated curves (Model)

function germCell(id, hist) {
  const isSem = hist === 'seminoma';
  const markers = isSem ? ['hcg', 'ldh'] : ['afp', 'hcg'];
  const txOptions = isSem ? ['surveillance', 'carboplatin', 'rt', 'bep3', 'bep4'] : ['surveillance', 'bep1', 'rplnd', 'bep3', 'bep4'];
  return {
    id, mode: 'tumours', unit: 'mo', tMax: 60, dt: 0.05, view: 'testis',
    params: [
      { key: 'stage', type: 'select', options: GCT_STAGES, def: 'I' },
      { key: 'size', type: 'range', min: 1, max: 10, step: 0.5, def: isSem ? 3 : 2.5, unit: 'cm' },
      ...(isSem ? [{ key: 'rete', type: 'bool', def: false }] : [{ key: 'lvi', type: 'bool', def: false }]),
      ...(isSem ? [] : [{ key: 'afp0', type: 'range', min: 0, max: 20000, step: 50, def: 600, unit: 'ng/mL' }]),
      { key: 'hcg0', type: 'range', min: 0, max: 100000, step: isSem ? 5 : 100, def: isSem ? 15 : 1500, unit: 'IU/L' },
      { key: 'ldh0', type: 'range', min: 1, max: 12, step: 0.1, def: isSem ? 1.3 : 1.2, unit: '×ULN' },
      { key: 'visceral', type: 'bool', def: false },
      { key: 'treatment', type: 'select', options: txOptions, def: 'surveillance' },
    ],
    series: [
      ...markers.map((m) => ({ key: m, unit: m === 'afp' ? 'ng/mL' : m === 'hcg' ? 'IU/L' : '×ULN', min: 0 })),
      { key: 'relapse', unit: '%', min: 0, max: 100 },
      { key: 'survival', unit: '%', min: 0, max: 100 },
    ],
    init(p) {
      const m0 = { afp: isSem ? 0 : p.afp0, hcg: p.hcg0, ldh: p.ldh0 };
      const st = { C: 0, O: 0, A: 0, F: 0, D: 0, relapsed: 0, removed: false, tx: false, S: 1, prim: {}, met: {}, rel: 0 };
      for (const m of ['afp', 'hcg', 'ldh']) {
        const excess = Math.max(0, m0[m] - MARKER_NORMAL[m]);
        st.prim[m] = excess * (1 - MET_SHARE[p.stage]); st.met[m] = excess * MET_SHARE[p.stage];
      }
      st.nodes = { I: 0, IIA: 1.5, IIB: 3.5, IIC: 6, III: 7 }[p.stage];
      st.lung = p.stage === 'III' ? 0.6 : 0; st.size = p.size;
      Object.assign(st, markerLevels(st));
      return st;
    },
    step(st, t, dt, p, arm, emit) {
      const k = Math.LN2 / (isSem ? 3 : 1.5); // marker / tumour growth while untreated (Model)
      if (arm === 'untreated') {
        for (const m of ['afp', 'hcg', 'ldh']) { st.prim[m] = Math.min((isSem ? CAP_SEM : CAP)[m] * 0.3, st.prim[m] * Math.exp(k * dt)); st.met[m] = Math.min((isSem ? CAP_SEM : CAP)[m] * 0.7, (st.met[m] + st.prim[m] * 0.02 * dt) * Math.exp(k * dt)); }
        st.size = Math.min(9, st.size * Math.exp(k * 0.25 * dt)); st.nodes = Math.min(9, st.nodes + 0.12 * dt * (1 + st.nodes / 3)); st.lung = Math.min(1, st.lung + 0.012 * dt * (1 + 3 * st.lung));
        const h = weibullHazard(t, UNTREATED_MEDIAN[hist][p.stage], 1.5);
        st.S *= Math.exp(-h * dt);
        if (st.nodes > 2 && p.stage === 'I') emit('nodalSpread');
        if (st.lung > 0.3) emit('lungMets');
      } else {
        if (!st.removed && t >= T_ORCH) {
          st.removed = true; emit('orchiectomy');
          if (p.stage !== 'I') emit('stagingCT');
          if (p.stage === 'I' && !isSem && (p.afp0 > 1000 || p.hcg0 > 5000)) emit('checkMarkers');
        }
        // primary marker clearance by half-life after orchiectomy
        if (st.removed) for (const m of ['afp', 'hcg', 'ldh']) st.prim[m] *= Math.exp(-Math.LN2 / HALF[m] * dt);
        if (st.removed && t >= T_TX - 0.25 && p.stage !== 'I') {
          const elevated = markers.some((m) => st.met[m] > MARKER_NORMAL[m] * 2);
          if (elevated) emit('markerPlateau');
        }
        if (st.removed && p.stage === 'I' && t >= T_TX - 0.25) emit('markersNormal');
        if (!st.tx && t >= T_TX) {
          st.tx = true; st.out = gctOutcome(hist, p, p.treatment);
          st.O = st.out.relapse; st.C = 1 - st.O;
          emit('start', { tx: p.treatment });
          if (!st.out.adequate) emit('inadequate');
          if (st.out.over) emit('overtreatment');
          if (['bep3', 'bep4', 'bep1'].includes(p.treatment)) emit('spermBanking');
          if (p.treatment === 'rt') emit('rtField');
          if (p.stage !== 'I' && ['bep3', 'bep4'].includes(p.treatment) && st.out.adequate) emit('residualMass', { cm: isSem ? 3 : 1 });
        }
        if (st.tx) {
          const treatsMets = p.treatment !== 'surveillance' || p.stage === 'I';
          for (const m of ['afp', 'hcg', 'ldh']) st.met[m] = treatsMets ? st.met[m] * Math.exp(-Math.LN2 / HALF[m] * dt) : Math.min((isSem ? CAP_SEM : CAP)[m] * 0.7, st.met[m] * Math.exp(k * dt));
          if (treatsMets) { st.nodes = relax(st.nodes, st.out.adequate ? 0.3 : st.nodes * 0.5, dt, 2); st.lung = relax(st.lung, 0, dt, 2); } else { st.nodes = Math.min(9, st.nodes + 0.12 * dt); }
          const lam = Math.LN2 / (isSem ? 12 : 7);
          const fromO = st.O * (1 - Math.exp(-lam * dt));
          st.O -= fromO; st.A += fromO; st.relapsed += fromO;
          const fromA = st.A * (1 - Math.exp(-dt / 3));
          st.A -= fromA; st.C += fromA * st.out.salvage; st.F += fromA * (1 - st.out.salvage);
          const dead = st.F * (1 - Math.exp(-Math.LN2 / 8 * dt));
          st.F -= dead; st.D += dead;
          st.S = 1 - st.D;
          if (st.relapsed > 0.05) emit('relapse5');
        }
      }
      Object.assign(st, markerLevels(st, arm === 'treated' && st.tx ? st.A + st.O * 0.05 : 0));
      if (arm === 'untreated' && st.S < 0.5) emit('median');
      return st;
    },
    steps(st, p, arm) {
      const k = ['primary'];
      if (p.stage !== 'I' || st.nodes > 1.5) k.push('nodes');
      if (st.lung > 0.15 || p.stage === 'III') k.push('lung');
      if (st.removed) k.push('orchiectomy');
      if (st.removed) k.push('halfLife');
      if (st.tx) k.push(p.treatment === 'surveillance' ? 'surveillance' : p.treatment === 'rt' ? 'radiotherapy' : p.treatment === 'rplnd' ? 'rplnd' : 'chemo');
      if (st.relapsed > 0.02) k.push('relapse');
      return k;
    },
    get: { relapse: (st) => st.relapsed * 100, survival: (st) => st.S * 100 },
    gauges(st, p) {
      const g = [{ key: 'relapseRisk', value: (p.stage === 'I' ? stageIRelapse(hist, p) : 1 - IGCCCG[hist][p.stage === 'IIA' || p.stage === 'IIB' ? 'good' : igcccg(hist, p)].pfs) * 100, unit: '%', lo: 0, hi: 0, band: false }];
      for (const m of markers) g.push({ key: m, value: st[m], unit: m === 'afp' ? 'ng/mL' : m === 'hcg' ? 'IU/L' : '×ULN', lo: 0, hi: m === 'afp' ? 7 : m === 'hcg' ? 5 : 1 });
      return g;
    },
    decision(st, p) { return p.stage === 'I' ? `I_${gctRecommendation(hist, p)}` : p.stage === 'IIA' || p.stage === 'IIB' ? `II_${gctRecommendation(hist, p)}` : `adv_${igcccg(hist, p)}`; },
    schematic(st, p, arm) {
      return {
        kind: 'genital', panel: 'mets',
        testis: { removed: st.removed, scar: st.removed ? 'inguinal' : null, tumour: { size: st.size, hist } },
        nodes: { rp: clamp(st.nodes / 8, 0, 1) * (st.tx && st.out?.adequate ? 0.4 : 1), rpCm: st.nodes },
        mets: { lung: st.lung, liver: p.visceral ? 0.7 : 0, brain: 0 },
        rt: st.tx && p.treatment === 'rt', chemo: st.tx && ['bep1', 'bep3', 'bep4', 'carboplatin'].includes(p.treatment) ? p.treatment : null, rplnd: st.tx && p.treatment === 'rplnd',
        badges: markers.map((m) => ({ key: m, value: st[m] })),
      };
    },
  };
}
function markerLevels(st, relapseShare = 0) {
  const o = {};
  for (const m of ['afp', 'hcg', 'ldh']) {
    const base = st.prim[m] + st.met[m];
    o[m] = MARKER_NORMAL[m] + base + relapseShare * 300 * (m === 'afp' ? 1 : m === 'hcg' ? 0.5 : 0.002);
  }
  return o;
}
export const seminoma = germCell('seminoma', 'seminoma');
export const nonSeminoma = germCell('nonSeminoma', 'nsgct');

// ---------------------------------------------------------------------------
// Leydig cell tumour (months)
// ---------------------------------------------------------------------------
export const leydig = {
  id: 'leydig', mode: 'tumours', unit: 'mo', tMax: 60, dt: 0.25, view: 'testis',
  params: [
    { key: 'size', type: 'range', min: 0.5, max: 8, step: 0.5, def: 1.5, unit: 'cm' },
    { key: 'malignantFeatures', type: 'bool', def: false },
    { key: 'child', type: 'bool', def: false },
    { key: 'treatment', type: 'select', options: ['sparing', 'orchiectomy'], def: 'sparing' },
  ],
  series: [
    { key: 'estradiol', unit: 'pg/mL', min: 0 },
    { key: 'gyn', unit: '%', min: 0, max: 100 },
    { key: 'pM', unit: '%', min: 0, max: 100 },
  ],
  init(p) { return { E: 60 + p.size * 15, gyn: 30, pM: 0, removed: false, spared: false, local: 0, pMal: pMalignant(p) }; },
  step(st, t, dt, p, arm, emit) {
    if (arm === 'treated' && !st.removed && !st.spared && t >= 0.5) {
      if (p.treatment === 'sparing') {
        st.spared = true; emit('sparing');
        if (p.size > 2 || p.malignantFeatures) emit('sparingNotIdeal');
        st.local = st.pMal * 0.5;
      } else { st.removed = true; emit('orchiectomy'); }
      if (st.pMal > 0.2) emit('malignantFollowUp');
    }
    const active = arm === 'untreated' || t < 0.5;
    st.E = relax(st.E, active ? 60 + p.size * 15 + t * 1.5 : 25, dt, active ? 12 : 1.5);
    // gynaecomastia (adult) or precocious virilisation (child): grows with oestrogen/androgen excess, partly fibrotic after a year (Model)
    st.gyn = relax(st.gyn, active ? clamp((st.E - 30) * 0.9, 0, 95) : Math.max(5, st.gynFloor ?? 0), dt, active ? 8 : 4);
    if (active) st.gynFloor = Math.min(40, (st.gynFloor ?? 0) + 0.4 * dt);
    const metRate = 0.004 * st.pMal * (active ? 1 : (st.local ? 0.3 : 0.15)); // malignant Leydig: ≈ 10 % of Leydig tumours (Model)
    st.pM += metRate * dt * (1 - st.pM) * (active ? 1 + t / 24 : 1);
    if (st.gyn > 50) emit('gynaecomastia');
    if (st.pM > 0.05) emit('pM5');
    return st;
  },
  steps(st, p) {
    const k = ['leydig', 'hormones'];
    k.push(p.child ? 'virilisation' : 'gynaecomastia');
    if (st.removed) k.push('orchiectomy'); if (st.spared) k.push('sparing');
    if (st.removed || st.spared) k.push('normalise');
    if (st.pMal > 0.2) k.push('malignant');
    return k;
  },
  get: { estradiol: (st) => st.E, gyn: (st) => st.gyn, pM: (st) => st.pM * 100 },
  gauges(st, p) { return [{ key: 'pMalignant', value: st.pMal * 100, unit: '%', lo: 0, hi: 10 }, { key: 'estradiol', value: st.E, unit: 'pg/mL', lo: 10, hi: 40 }]; },
  decision(st, p) { return p.malignantFeatures || p.size > 5 ? 'orchiectomy' : p.size <= 2 ? 'sparing' : 'orchiectomyOrSparing'; },
  schematic(st, p) { return { kind: 'genital', panel: 'mets', testis: { removed: st.removed, scar: st.removed ? 'inguinal' : st.spared ? 'sparing' : null, tumour: st.removed || st.spared ? null : { size: p.size, hist: 'leydig' } }, nodes: { rp: st.pM * 0.8 }, mets: { lung: st.pM * 0.6, liver: st.pM * 0.4, brain: 0 }, gyn: st.gyn / 100, child: p.child, badges: [{ key: 'estradiol', value: st.E }] }; },
};
export function pMalignant(p) { return p.malignantFeatures ? 0.6 : p.size > 5 ? 0.3 : 0.05; }

// ---------------------------------------------------------------------------
// Penile squamous cell carcinoma (years)
// ---------------------------------------------------------------------------
export const PEN_T = ['Tis', 'Ta', 'T1a', 'T1b', 'T2', 'T3', 'T4'];
const T_IDX = Object.fromEntries(PEN_T.map((x, i) => [x, i]));
/** Probability of occult inguinal metastasis in cN0 (Model; EAU risk groups: low pTis/Ta/T1a G1, intermediate T1a G2, high ≥ T1b or G3). */
export function occultNodes(p) {
  const base = { Tis: 0.01, Ta: 0.02, T1a: p.grade >= 2 ? 0.15 : 0.08, T1b: 0.3, T2: 0.45, T3: 0.5, T4: 0.6 }[p.tStage];
  return clamp(base * (p.grade === 3 ? 1.25 : 1) * (p.hpv ? 0.85 : 1), 0, 0.85);
}
/** Is the primary treatment oncologically adequate for this T category (EAU)? */
export function primaryAdequate(t, tx) {
  const i = T_IDX[t];
  if (tx === 'organSparing') return i <= T_IDX.T1a;
  if (tx === 'glansectomy') return i <= T_IDX.T2;
  if (tx === 'partialPenectomy') return i <= T_IDX.T3;
  return true;
}
const CN_CURE = { cN1: 0.8, cN2: 0.6, cN3: 0.35 }; // 5-year cancer-specific survival after radical treatment (Model, from EAU-cited series)
export const penile = {
  id: 'penile', mode: 'tumours', unit: 'y', tMax: 10, dt: 0.02, view: 'penis',
  params: [
    { key: 'tStage', type: 'select', options: PEN_T, def: 'T2' },
    { key: 'grade', type: 'range', min: 1, max: 3, step: 1, def: 2, unit: '' },
    { key: 'cN', type: 'select', options: ['cN0', 'cN1', 'cN2', 'cN3'], def: 'cN0' },
    { key: 'hpv', type: 'bool', def: false },
    { key: 'primary', type: 'select', options: ['organSparing', 'glansectomy', 'partialPenectomy', 'totalPenectomy'], def: 'partialPenectomy' },
    { key: 'nodal', type: 'select', options: ['dsnb', 'surveillance', 'radicalIlnd'], def: 'dsnb' },
  ],
  series: [
    { key: 'nodal', unit: '%', min: 0, max: 100 },
    { key: 'localRecur', unit: '%', min: 0, max: 100 },
    { key: 'css', unit: '%', min: 0, max: 100 },
  ],
  init(p) {
    const clin = p.cN !== 'cN0';
    const occ = clin ? 0 : occultNodes(p);
    return { occ, clin: clin ? 1 : 0, cured: clin ? 0 : 1 - occ, active: clin ? 1 : occ, lesion: 0.6 + T_IDX[p.tStage] * 0.5, local: 0, D: 0, S: 1, done: false, amputated: null, nodesTx: false, len: 1 };
  },
  step(st, t, dt, p, arm, emit) {
    if (arm === 'untreated') {
      st.lesion = Math.min(5, st.lesion + 0.5 * dt);
      st.active = Math.min(1, st.active + (1 - st.active) * 0.25 * dt);
      st.S *= Math.exp(-st.active * 0.45 * dt);
      if (st.active > 0.6) emit('inguinalMasses');
    } else {
      if (!st.done && t >= 0.08) {
        st.done = true;
        const ok = primaryAdequate(p.tStage, p.primary);
        st.local = ok ? (p.primary === 'organSparing' ? 0.12 : p.primary === 'glansectomy' ? 0.08 : 0.04) : 0.4;
        st.amputated = p.primary === 'partialPenectomy' ? 'partial' : p.primary === 'totalPenectomy' ? 'total' : null;
        st.len = p.primary === 'partialPenectomy' ? 0.55 : p.primary === 'totalPenectomy' ? 0 : p.primary === 'glansectomy' ? 0.85 : 1;
        st.lesion = 0; st.localTarget = st.local;
        emit('primary', { tx: p.primary });
        if (!ok) emit('primaryInadequate');
        if (p.primary === 'totalPenectomy') emit('urethrostomy');
        if (p.primary === 'totalPenectomy' && T_IDX[p.tStage] < T_IDX.T3) emit('overtreatment');
        // nodes
        const highRisk = T_IDX[p.tStage] >= T_IDX.T1b || p.grade === 3 || (p.tStage === 'T1a' && p.grade >= 2);
        if (p.cN === 'cN0') {
          if (p.nodal === 'surveillance') { emit('nodalSurveillance'); if (highRisk) emit('surveillanceHighRisk'); st.delayed = true; }
          else { emit(p.nodal); st.nodesTx = true; st.cured += st.occ * 0.88; st.Fail = st.occ * 0.12; st.active = 0; if (p.nodal === 'radicalIlnd') emit('lymphoedema'); }
        } else {
          if (p.nodal !== 'radicalIlnd') { emit('needsIlnd'); st.cnUndertreated = true; }
          const cure = CN_CURE[p.cN] * (p.nodal === 'radicalIlnd' ? 1 : 0.5);
          if (p.cN === 'cN3') emit('neoadjuvant');
          if (p.cN !== 'cN1') emit('pelvic');
          st.nodesTx = true; st.cured = cure; st.Fail = 1 - cure; st.active = 0; emit('lymphoedema');
        }
      }
      if (st.done) {
        st.localCum = (st.localCum ?? 0) + (st.localTarget - (st.localCum ?? 0)) * (1 - Math.exp(-dt / 1.2));
        if (st.delayed) {
          // occult nodes surface as palpable masses over ~2 years and are treated late (5-yr CSS ≈ 35–40 %)
          const surf = st.occ * (1 - Math.exp(-dt / 1.0));
          st.occ -= surf; st.lateTreated = (st.lateTreated ?? 0) + surf; st.cured += surf * 0.4; st.Fail = (st.Fail ?? 0) + surf * 0.6;
          st.active = st.occ;
          if ((st.lateTreated ?? 0) > 0.05) emit('lateNodes');
        }
        const dying = (st.Fail ?? 0) * (1 - Math.exp(-0.5 * dt));
        st.Fail -= dying; st.D += dying; st.S = 1 - st.D;
      }
    }
    return st;
  },
  steps(st, p, arm) {
    const k = ['primary'];
    if (T_IDX[p.tStage] >= T_IDX.T1b) k.push('invasion');
    k.push(p.cN === 'cN0' ? 'occult' : 'clinicalNodes');
    if (st.done) k.push('treatedPrimary');
    if (st.nodesTx) k.push('nodesTreated');
    if (st.delayed && (st.lateTreated ?? 0) > 0.02) k.push('lateNodes');
    return k;
  },
  get: { nodal: (st) => st.active * 100, localRecur: (st) => (st.localCum ?? 0) * 100, css: (st) => st.S * 100 },
  gauges(st, p) { return [{ key: 'occultRisk', value: occultNodes(p) * 100, unit: '%', lo: 0, hi: 0, band: false }, { key: 'length', value: st.len * 100, unit: '%', lo: 50, hi: 100 }]; },
  decision(st, p) {
    const prim = T_IDX[p.tStage] <= T_IDX.T1a ? 'sparing' : T_IDX[p.tStage] <= T_IDX.T2 ? 'glans' : p.tStage === 'T3' ? 'partial' : 'total';
    const n = p.cN === 'cN0' ? (T_IDX[p.tStage] >= T_IDX.T1b || p.grade >= 2 && T_IDX[p.tStage] >= T_IDX.T1a ? 'dsnb' : 'watch') : p.cN === 'cN3' ? 'neo' : 'ilnd';
    return `${prim}_${n}`;
  },
  schematic(st, p) { return { kind: 'genital', panel: 'mets', penis: { lesion: st.lesion > 0 ? { size: st.lesion, t: p.tStage } : null, amputated: st.amputated, length: st.len, urethrostomy: st.amputated === 'total' }, nodes: { inguinal: st.active, inguinalTreated: st.nodesTx, pelvic: p.cN === 'cN3' || p.cN === 'cN2' ? 0.6 * st.active + (st.nodesTx ? 0 : 0) : 0 }, mets: { lung: (1 - st.S) * 0.6, liver: 0, brain: 0 }, penileMode: true }; },
};

export const TUMOURS = [seminoma, nonSeminoma, leydig, penile];
