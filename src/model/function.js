// Male infertility (hypothalamic–pituitary–testicular axis, semen analysis, assisted reproduction) and
// erectile dysfunction (NO–cGMP and PGE1–cAMP pathways, treatment ladder). Pure functions only.
import { clamp, relax } from './core.js';

// ---------------------------------------------------------------------------
// Male infertility (months)
// ---------------------------------------------------------------------------
/** WHO 2021 lower reference limits (5th centile). */
export const WHO = { volume: 1.4, conc: 16, total: 39, motility: 42, progressive: 30, morphology: 4 };
/** Typical profile of each cause: FSH, LH (IU/L), testosterone (nmol/L), sperm concentration (M/mL), semen volume (mL), testis volume (mL). */
export const PROFILE = {
  normal: { fsh: 5, lh: 5, t: 18, conc: 55, vol: 3, testis: 18, motility: 55 },
  hypogonadotropic: { fsh: 0.4, lh: 0.4, t: 2.5, conc: 0, vol: 0.6, testis: 4, motility: 0 },
  klinefelter: { fsh: 38, lh: 22, t: 7, conc: 0, vol: 1.5, testis: 3, motility: 0 },
  obstructive: { fsh: 5, lh: 5, t: 18, conc: 0, vol: 0.8, testis: 18, motility: 0 },
  varicocele: { fsh: 8, lh: 6, t: 15, conc: 11, vol: 2.8, testis: 14, motility: 30 },
  anabolic: { fsh: 0.3, lh: 0.3, t: 45, conc: 1, vol: 2.5, testis: 10, motility: 20 },
};
/** Monthly probability of natural conception for a given sperm concentration and female age (Model). */
export const fecundity = (conc, femaleAge) => 0.2 * (conc / (conc + 20)) ** 2 * clamp(1 - Math.max(0, femaleAge - 31) * 0.07, 0.15, 1);
/** Live-birth-equivalent pregnancy rate per ICSI cycle by female age (Model). */
export const icsiRate = (femaleAge) => clamp(0.42 - Math.max(0, femaleAge - 34) * 0.04, 0.08, 0.42);
export const infertility = {
  id: 'infertility', mode: 'function', unit: 'mo', tMax: 24, dt: 0.1, view: 'hpg',
  params: [
    { key: 'cause', type: 'select', options: ['hypogonadotropic', 'klinefelter', 'obstructive', 'varicocele', 'anabolic', 'normal'], def: 'hypogonadotropic' },
    { key: 'femaleAge', type: 'range', min: 25, max: 42, step: 1, def: 32, unit: 'y' },
    { key: 'kallmann', type: 'bool', def: false },
  ],
  series: [
    { key: 'conc', unit: 'M/mL', min: 0 },
    { key: 'fsh', unit: 'IU/L', min: 0 },
    { key: 't', unit: 'nmol/L', min: 0 },
    { key: 'preg', unit: '%', min: 0, max: 100 },
  ],
  init(p) { const P = PROFILE[p.cause]; return { ...P, preg: 0, sperm: false, tese: null, cycles: 0, nextIcsi: null, hcg: false, fshTx: false, stopped: false }; },
  step(st, t, dt, p, arm, emit) {
    const P = PROFILE[p.cause];
    if (t >= 0.2) emit(`workup_${p.cause}`);
    if (p.kallmann && p.cause === 'hypogonadotropic') emit('anosmia');
    if (arm === 'treated') {
      switch (p.cause) {
        case 'hypogonadotropic':
          if (!st.hcg && t >= 0.5) { st.hcg = true; emit('hcg'); }
          if (!st.fshTx && t >= 6) { st.fshTx = true; emit('addFsh'); }
          st.lh = 0.4; // exogenous hCG acts as LH; endogenous LH stays low
          st.t = relax(st.t, st.hcg ? 17 : P.t, dt, 1.5);
          st.fsh = st.fshTx ? relax(st.fsh, 6, dt, 0.5) : st.fsh;
          st.testis = relax(st.testis, st.hcg ? (st.fshTx ? 13 : 8) : P.testis, dt, 6);
          st.conc = relax(st.conc, st.fshTx && t > 9 ? 12 : 0, dt, 4);
          if (st.conc > 1) emit('spermAppear');
          break;
        case 'klinefelter':
          if (!st.tese && t >= 3) { st.tese = true; st.retrieval = 0.45; emit('microTese'); emit('noTestosterone'); st.nextIcsi = 4; }
          break;
        case 'obstructive':
          if (!st.tese && t >= 2) { st.tese = true; st.retrieval = 0.97; emit('retrieval'); emit('cftr'); st.nextIcsi = 3; }
          break;
        case 'varicocele':
          if (!st.fixed && t >= 1) { st.fixed = true; emit('varicocelectomy'); }
          if (st.fixed) st.conc = relax(st.conc, 20, dt, 3.5);
          break;
        case 'anabolic':
          if (!st.stopped && t >= 0.5) { st.stopped = true; emit('stopSteroids'); }
          if (st.stopped) {
            // exogenous androgen washes out in weeks; the axis wakes up over months; sperm follow with the ~74-day lag
            st.t = relax(st.t, t < 3 ? 6 : 17, dt, t < 3 ? 0.6 : 3);
            st.lh = relax(st.lh, 5, dt, 4); st.fsh = relax(st.fsh, 5, dt, 4);
            st.conc = relax(st.conc, t > 3.5 ? 40 : 1, dt, 5);
            st.testis = relax(st.testis, 17, dt, 6);
            if (t > 1.5 && t < 4) emit('transientHypogonadism');
          }
          break;
        default: if (t >= 1) emit('femaleWorkup');
      }
    }
    // ICSI cycles every 2 months once sperm are available
    if (st.nextIcsi !== null && t >= st.nextIcsi && st.cycles < 3) {
      st.cycles += 1; st.nextIcsi += 2;
      const pr = (st.retrieval ?? 1) * icsiRate(p.femaleAge) * (1 - st.preg);
      st.preg += pr; emit('icsi', { n: st.cycles }, false);
    }
    st.preg += (1 - st.preg) * fecundity(st.conc, p.femaleAge) * dt;
    return st;
  },
  steps(st, p) {
    const k = ['axis'];
    k.push({ hypogonadotropic: 'central', klinefelter: 'primary', obstructive: 'obstruction', varicocele: 'varicocele', anabolic: 'feedback', normal: 'normalMale' }[p.cause]);
    if (st.hcg || st.fshTx) k.push('gonadotropins');
    if (st.tese) k.push('retrieval');
    if (st.cycles) k.push('icsi');
    if (st.stopped) k.push('recovery');
    if (st.fixed) k.push('repair');
    return k;
  },
  get: { preg: (st) => st.preg * 100 },
  gauges(st, p) { return [{ key: 'lh', value: st.lh, unit: 'IU/L', lo: 1.5, hi: 9 }, { key: 'semenVolume', value: st.vol, unit: 'mL', lo: 1.4, hi: 6 }, { key: 'motility', value: st.motility, unit: '%', lo: 42, hi: 100 }, { key: 'testis', value: st.testis, unit: 'mL', lo: 15, hi: 25 }]; },
  decision(st, p) { return p.cause; },
  schematic(st, p) { return { kind: 'genital', panel: 'hpg', hpg: { gnrh: p.cause === 'hypogonadotropic' ? 0.1 : p.cause === 'anabolic' && !st.stopped ? 0.2 : p.cause === 'klinefelter' ? 1.6 : 1, lh: st.lh, fsh: st.fsh, t: st.t, exo: p.cause === 'anabolic' && !st.stopped, hcg: !!st.hcg }, testis: { small: st.testis < 10, volume: st.testis, obstruction: p.cause === 'obstructive', varicocele: p.cause === 'varicocele' && !st.fixed ? 0.66 : 0 }, badges: [{ key: 'conc', value: st.conc }] }; },
};

// ---------------------------------------------------------------------------
// Erectile dysfunction (months)
// ---------------------------------------------------------------------------
/** Gain in IIEF-5 points by treatment and cause (Model, from response rates in the literature). */
export const GAIN = {
  lifestyle: { vasculogenic: 2.5, diabetic: 2, postProstatectomy: 0, psychogenic: 1, hypogonadal: 1 },
  pde5i: { vasculogenic: 7, diabetic: 4.5, postProstatectomy: 4, psychogenic: 8, hypogonadal: 2.5 },
  vacuum: { vasculogenic: 6, diabetic: 6, postProstatectomy: 6, psychogenic: 5, hypogonadal: 5 },
  alprostadil: { vasculogenic: 9, diabetic: 8.5, postProstatectomy: 9.5, psychogenic: 9, hypogonadal: 8 },
  testosterone: { vasculogenic: 0, diabetic: 0, postProstatectomy: 0, psychogenic: 0, hypogonadal: 5 },
  prosthesis: { vasculogenic: 99, diabetic: 99, postProstatectomy: 99, psychogenic: 99, hypogonadal: 99 },
};
const DRIFT = { vasculogenic: -0.05, diabetic: -0.09, postProstatectomy: 0.12, psychogenic: 0, hypogonadal: 0 };
export const ed = {
  id: 'ed', mode: 'function', unit: 'mo', tMax: 12, dt: 0.05, view: 'erection',
  params: [
    { key: 'cause', type: 'select', options: ['vasculogenic', 'diabetic', 'postProstatectomy', 'psychogenic', 'hypogonadal'], def: 'vasculogenic' },
    { key: 'iief0', type: 'range', min: 5, max: 21, step: 1, def: 11, unit: '' },
    { key: 'nitrates', type: 'bool', def: false },
    { key: 'treatment', type: 'select', options: ['pde5i', 'lifestyle', 'vacuum', 'alprostadil', 'testosterone', 'prosthesis'], def: 'pde5i' },
  ],
  series: [
    { key: 'iief', unit: '', min: 5, max: 25 },
    { key: 'success', unit: '%', min: 0, max: 100 },
  ],
  init(p) { return { base: p.iief0, gain: 0, iief: p.iief0, started: false, t: p.cause === 'hypogonadal' ? 7 : 16 }; },
  step(st, t, dt, p, arm, emit) {
    if (['vasculogenic', 'diabetic'].includes(p.cause)) emit('cvSentinel');
    st.base = clamp(st.base + DRIFT[p.cause] * dt, 5, 25);
    if (arm === 'treated' && !st.started && t >= 0.5) {
      st.started = true; emit(p.treatment);
      if (p.treatment === 'pde5i' && p.nitrates) emit('nitrates');
      if (p.treatment === 'testosterone' && p.cause !== 'hypogonadal') emit('testosteroneNormal');
      if (p.treatment === 'prosthesis') emit('thirdLine');
      if (p.treatment === 'alprostadil') emit('priapism');
      if (p.treatment === 'pde5i' && p.cause === 'postProstatectomy') emit('nerveDependent');
    }
    let target = 0;
    if (st.started) {
      target = GAIN[p.treatment][p.cause];
      if (p.treatment === 'pde5i' && p.nitrates) target = 0;
      if (p.treatment === 'prosthesis') target = 23 - st.base;
    }
    st.gain = relax(st.gain, target, dt, p.treatment === 'lifestyle' || p.treatment === 'testosterone' ? 2.5 : p.treatment === 'prosthesis' ? 0.8 : 0.3);
    if (p.treatment === 'testosterone' && st.started && p.cause === 'hypogonadal') st.t = relax(st.t, 17, dt, 1);
    st.iief = clamp(st.base + st.gain, 5, 25);
    if (st.iief >= 22) emit('normal');
    return st;
  },
  steps(st, p) {
    const k = ['no', p.cause === 'psychogenic' ? 'adrenergic' : p.cause === 'postProstatectomy' ? 'nerve' : p.cause === 'hypogonadal' ? 'androgen' : 'endothelium'];
    if (st.started) k.push({ pde5i: 'pde5', lifestyle: 'lifestyle', vacuum: 'vacuum', alprostadil: 'camp', testosterone: 'androgenTx', prosthesis: 'prosthesis' }[p.treatment]);
    return k;
  },
  get: { success: (st) => clamp((st.iief - 7) / 15, 0, 1) * 100 },
  gauges(st, p) { return [{ key: 'testosterone', value: st.t, unit: 'nmol/L', lo: 12, hi: 35 }, { key: 'severity', value: st.iief, unit: '', lo: 22, hi: 25 }]; },
  decision(st, p) {
    if (p.cause === 'hypogonadal') return 'hypogonadal';
    if (p.nitrates) return 'nitrates';
    if (p.cause === 'psychogenic') return 'psychogenic';
    return 'firstLine';
  },
  schematic(st, p) {
    const rig = clamp((st.iief - 5) / 18, 0, 1);
    return { kind: 'genital', panel: 'erection', erection: { rigidity: rig, path: p.treatment, started: st.started, cause: p.cause, blocked: p.nitrates && p.treatment === 'pde5i' }, penis: { erect: true, rigidity: rig, prosthesis: st.started && p.treatment === 'prosthesis', vacuum: st.started && p.treatment === 'vacuum' }, badges: [{ key: 'iief', value: st.iief }] };
  },
};

export const FUNCTION = [infertility, ed];
