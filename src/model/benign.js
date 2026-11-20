// Benign genital and scrotal disease: acute scrotum, cryptorchidism, varicocele, hydrocele, phimosis and
// lichen sclerosus, Peyronie's disease, hypospadias and epispadias. Pure functions only.
import { clamp, relax, logistic } from './core.js';

// ---------------------------------------------------------------------------
// Acute scrotum: testicular torsion vs torsion of the appendix testis vs epididymo-orchitis (hours)
// ---------------------------------------------------------------------------
/** Hours of ischaemia at which half of torsed testes are lost; tighter twists are lost sooner (Model). */
export const t50 = (deg) => 12 * Math.sqrt(720 / deg);
/** Probability that the testis is still viable after h hours of full ischaemia. */
export const viability = (h, deg) => 1 / (1 + Math.exp((h - t50(deg)) / 2.4));
export const acuteScrotum = {
  id: 'acuteScrotum', mode: 'benign', unit: 'h', tMax: 48, dt: 0.1, view: 'testis',
  params: [
    { key: 'cause', type: 'select', options: ['torsion', 'appendix', 'epididymitis'], def: 'torsion' },
    { key: 'degrees', type: 'range', min: 180, max: 1080, step: 180, def: 720, unit: '°' },
    { key: 'hoursToSurgery', type: 'range', min: 2, max: 36, step: 1, def: 5, unit: 'h' },
    { key: 'manualDetorsion', type: 'bool', def: false },
    { key: 'age', type: 'range', min: 1, max: 80, step: 1, def: 14, unit: 'y' },
  ],
  series: [
    { key: 'perfusion', unit: '%', min: 0, max: 200 },
    { key: 'viable', unit: '%', min: 0, max: 100 },
    { key: 'pain', unit: '/10', min: 0, max: 10 },
  ],
  init(p) {
    const tor = p.cause === 'torsion';
    return { isch: 0, perfusion: tor ? Math.max(0, 100 - p.degrees / 9) : p.cause === 'epididymitis' ? 160 : 100, viable: 1, pain: tor ? 8 : p.cause === 'epididymitis' ? 6 : 5, fixed: false, removed: false, detorsed: false, abx: false, abscess: 0 };
  },
  step(st, t, dt, p, arm, emit) {
    if (p.cause === 'torsion') {
      // full twist (≥ 360°) stops arterial inflow; partial twists cause venous congestion first (Model)
      const block = clamp(p.degrees / 360, 0.5, 1);
      if (arm === 'treated' && p.manualDetorsion && !st.detorsed && t >= Math.min(1.5, p.hoursToSurgery - 0.5)) { st.detorsed = true; emit('manualDetorsion'); }
      if (arm === 'treated' && !st.fixed && t >= p.hoursToSurgery) {
        st.fixed = true;
        if (st.viable >= 0.5) emit('detorsionFixation', { pct: Math.round(st.viable * 100) }); else { st.removed = true; emit('orchiectomy', { pct: Math.round(st.viable * 100) }); }
        emit('contralateral');
      }
      const ischRate = st.fixed ? 0 : st.detorsed ? 0.25 * block : block;
      st.isch += ischRate * dt;
      st.viable = Math.min(st.viable, viability(st.isch, Math.max(p.degrees, 360)) * (p.degrees < 360 ? 1 : 1));
      st.perfusion = st.fixed && !st.removed ? relax(st.perfusion, 100 * st.viable + 10, dt, 2) : st.removed ? 0 : relax(st.perfusion, st.detorsed ? 70 : Math.max(0, 100 - p.degrees / 7), dt, 0.5);
      // pain: falls once surgery relieves the twist, but also falls when the testis has died (a misleading improvement)
      const target = st.fixed ? 2 : st.viable < 0.2 ? 4 : 9;
      st.pain = relax(st.pain, target, dt, st.fixed ? 6 : 3);
      if (st.viable < 0.5 && !st.fixed) emit('halfLost');
      if (st.viable < 0.1 && !st.fixed) emit('necrosis');
      if (arm === 'untreated' && st.viable < 0.2) emit('painFades');
    } else if (p.cause === 'appendix') {
      st.pain = relax(st.pain, arm === 'treated' && t > 1 ? 0.5 : 1, dt, arm === 'treated' && t > 1 ? 18 : 30);
      if (arm === 'treated' && t >= 1) emit('conservative');
      if (t >= 0.2) emit('blueDot');
    } else {
      if (arm === 'treated' && !st.abx && t >= 1) { st.abx = true; emit(p.age < 35 ? 'abxSti' : 'abxEnteric'); }
      st.pain = relax(st.pain, st.abx ? 1 : 7, dt, st.abx ? 16 : 30);
      st.perfusion = relax(st.perfusion, st.abx ? 110 : 170, dt, st.abx ? 20 : 30);
      if (!st.abx) st.abscess = Math.min(0.3, st.abscess + 0.006 * dt);
      if (st.abscess > 0.15) emit('abscess');
      emit('hyperaemia');
    }
    return st;
  },
  steps(st, p) {
    if (p.cause === 'torsion') {
      const k = ['twist', 'ischaemia'];
      if (st.detorsed) k.push('manual');
      if (st.fixed && !st.removed) k.push('fixation');
      if (st.removed) k.push('lost');
      if (!st.fixed && st.viable < 0.2) k.push('necrosis');
      return k;
    }
    if (p.cause === 'appendix') return ['appendix', 'selfLimited'];
    return st.abx ? ['infection', 'hyperaemia', 'antibiotics'] : ['infection', 'hyperaemia'];
  },
  get: { viable: (st) => st.viable * 100 },
  gauges(st, p) { return p.cause === 'torsion' ? [{ key: 'ischaemia', value: st.isch, unit: 'h', lo: 0, hi: 6 }, { key: 't50', value: t50(Math.max(p.degrees, 360)), unit: 'h', lo: 0, hi: 0, band: false }] : [{ key: 'flow', value: st.perfusion, unit: '%', lo: 70, hi: 130 }]; },
  decision(st, p) { return p.cause === 'torsion' ? 'explore' : p.cause === 'appendix' ? 'conservative' : p.age < 35 ? 'abxSti' : 'abxEnteric'; },
  schematic(st, p) {
    return { kind: 'genital', panel: 'doppler', flow: st.perfusion, testis: { torsion: p.cause === 'torsion' && !st.fixed ? { deg: p.degrees, isch: 1 - st.viable } : null, fixed: st.fixed && !st.removed, removed: st.removed, scar: st.fixed ? 'scrotal' : null, inflamed: p.cause === 'epididymitis', appendixTorsion: p.cause === 'appendix', isch: p.cause === 'torsion' ? 1 - st.viable : 0 } };
  },
};

// ---------------------------------------------------------------------------
// Cryptorchidism (years of age)
// ---------------------------------------------------------------------------
/** Yearly loss of germ cells while the testis stays out of the scrotum (Model; histological loss from the second year). */
export const GERM_LOSS = { retractile: 0, highScrotal: 0.05, inguinal: 0.09, abdominal: 0.16 };
/** Relative risk of testicular germ-cell tumour (untreated; ≈ halved by prepubertal orchidopexy). */
export const CANCER_RR = { retractile: 1, highScrotal: 2.5, inguinal: 3.5, abdominal: 6 };
/** Testis volume by age (mL): ≈ 1 mL before puberty, 15–20 mL in adults; scaled by the germ-cell index. */
export const testisVolume = (age, G) => (age < 10 ? 0.8 + age * 0.03 : 1.1 + 17 * logistic(age, 13.5, 1.3)) * (0.35 + 0.65 * G / 100);
export const cryptorchidism = {
  id: 'cryptorchidism', mode: 'benign', unit: 'y', tMax: 30, dt: 0.05, view: 'testis',
  params: [
    { key: 'position', type: 'select', options: ['inguinal', 'abdominal', 'highScrotal', 'retractile'], def: 'inguinal' },
    { key: 'bilateral', type: 'bool', def: false },
    { key: 'ageSurgery', type: 'range', min: 0.5, max: 14, step: 0.5, def: 1, unit: 'y' },
  ],
  series: [
    { key: 'germ', unit: '%', min: 0, max: 100 },
    { key: 'volume', unit: 'mL', min: 0 },
    { key: 'cancer', unit: '%', min: 0, max: 100 },
  ],
  init(p) { return { G: 100, pos: p.position, down: p.position === 'retractile', rr: CANCER_RR[p.position], cum: 0, done: false, vol: testisVolume(0, 100) }; },
  step(st, t, dt, p, arm, emit) {
    if (arm === 'treated' && !st.done && t >= p.ageSurgery) {
      st.done = true;
      if (p.position === 'retractile') emit('retractile');
      else {
        st.down = true; st.pos = 'scrotal';
        emit(p.position === 'abdominal' ? 'laparoscopy' : 'orchidopexy');
        if (p.ageSurgery > 1.5) emit('late');
        if (p.ageSurgery >= 11 && p.position === 'abdominal' && !p.bilateral) emit('considerOrchiectomy');
        st.rr = 1 + (CANCER_RR[p.position] - 1) * (p.ageSurgery < 11 ? 0.45 : 0.9);
      }
    }
    if (!st.down && t > 0.5) st.G *= Math.exp(-GERM_LOSS[p.position] * (t > 1 ? 1 : 0.4) * dt);
    if (st.down && p.position !== 'retractile' && t > p.ageSurgery) st.G *= Math.exp(-0.005 * dt);
    // germ-cell tumour incidence from puberty (Model: 6/100 000 per year baseline, × relative risk)
    if (t > 15) st.cum += 6e-5 * st.rr * dt;
    if (t > 12 && !st.down && p.position !== 'retractile') emit('pubertyUndescended');
    if (st.G < 50) emit('germHalf');
    st.vol = testisVolume(t, st.G);
    return st;
  },
  steps(st, p) {
    const k = [p.position === 'retractile' ? 'retractile' : 'undescended'];
    if (p.position !== 'retractile' && !st.down) k.push('heat');
    if (st.done && st.down) k.push('orchidopexy');
    if (st.G < 70) k.push('germLoss');
    k.push('cancerRisk');
    return k;
  },
  get: {
    germ: (st) => st.G,
    volume: (st) => st.vol,
    cancer: (st) => st.cum * 100,
  },
  gauges(st, p) {
    const pat = p.bilateral ? clamp(0.9 * st.G / 100 - 0.05, 0.05, 0.9) : 0.85 + 0.05 * st.G / 100;
    return [{ key: 'paternity', value: pat * 100, unit: '%', lo: 85, hi: 100 }, { key: 'rr', value: st.rr, unit: '×', lo: 0, hi: 1.5 }];
  },
  decision(st, p) { return p.position === 'retractile' ? 'noSurgery' : p.position === 'abdominal' ? 'laparoscopy' : 'orchidopexy'; },
  schematic(st, p) { return { kind: 'genital', panel: null, testis: { pos: st.down ? 'scrotal' : p.position === 'retractile' ? 'highScrotal' : p.position, volume: st.vol, scar: st.done && st.down && p.position !== 'retractile' ? (p.position === 'abdominal' ? 'laparoscopic' : 'inguinal') : null, small: st.G < 60 }, bilateral: p.bilateral }; },
};
// ---------------------------------------------------------------------------
// Varicocele (months)
// ---------------------------------------------------------------------------
const VAR_FACTOR = { subclinical: 0.97, 1: 0.85, 2: 0.65, 3: 0.5 };
export const varicocele = {
  id: 'varicocele', mode: 'benign', unit: 'mo', tMax: 36, dt: 0.25, view: 'testis',
  params: [
    { key: 'grade', type: 'select', options: ['subclinical', '1', '2', '3'], def: '2' },
    { key: 'adolescent', type: 'bool', def: false },
    { key: 'abnormalSemen', type: 'bool', def: true },
    { key: 'rightSided', type: 'bool', def: false },
    { key: 'treatment', type: 'select', options: ['microsurgery', 'embolization'], def: 'microsurgery' },
  ],
  series: [
    { key: 'conc', unit: 'M/mL', min: 0 },
    { key: 'asym', unit: '%', min: 0, max: 100 },
    { key: 'pregnancy', unit: '%', min: 0, max: 100 },
  ],
  init(p) {
    const f = p.abnormalSemen ? VAR_FACTOR[p.grade] : Math.sqrt(VAR_FACTOR[p.grade]);
    return { conc: 40 * f, asym: p.adolescent ? 10 + 3 * (p.grade === 'subclinical' ? 0 : +p.grade) : 8, preg: 0, done: false, hydro: 0 };
  },
  step(st, t, dt, p, arm, emit) {
    if (p.rightSided) emit('rightSided');
    if (arm === 'treated' && !st.done && t >= 1) {
      st.done = true; emit(p.treatment);
      if (p.grade === 'subclinical') emit('subclinicalNoBenefit');
      st.recur = p.treatment === 'microsurgery' ? 0.02 : 0.08; st.hydro = p.treatment === 'microsurgery' ? 0.005 : 0;
    }
    const f = p.abnormalSemen ? VAR_FACTOR[p.grade] : Math.sqrt(VAR_FACTOR[p.grade]);
    const repaired = st.done && p.grade !== 'subclinical';
    const target = repaired ? 40 * (f + (0.85 - f) * (1 - st.recur)) : 40 * f * (1 - 0.004 * t);
    // spermatogenesis takes ≈ 74 days, so changes appear with a lag of ~3 months
    st.conc = relax(st.conc, target, dt, repaired ? 3.5 : 24);
    if (p.adolescent) st.asym = repaired ? relax(st.asym, 6, dt, 10) : Math.min(45, st.asym + (p.grade === 'subclinical' ? 0 : +p.grade) * 0.12 * dt);
    if (p.adolescent && st.asym > 20) emit('asym20');
    const fecund = p.adolescent ? 0 : 0.2 * (st.conc / (st.conc + 20)) ** 2; // same curve as the infertility simulation (Model)
    st.preg += (1 - st.preg) * fecund * dt;
    if (repaired && st.conc > 30) emit('improved');
    return st;
  },
  steps(st, p) {
    const k = ['reflux', 'heat'];
    if (p.adolescent) k.push('asymmetry'); else k.push('semen');
    if (st.done) k.push(p.treatment);
    return k;
  },
  get: { pregnancy: (st) => st.preg * 100 },
  gauges(st, p) { return [{ key: 'conc', value: st.conc, unit: 'M/mL', lo: 16, hi: 200 }, { key: 'recurrence', value: (st.recur ?? 0) * 100, unit: '%', lo: 0, hi: 0, band: false }]; },
  decision(st, p) {
    if (p.rightSided) return 'imaging';
    if (p.grade === 'subclinical') return 'noTreatment';
    if (p.adolescent) return 'adolescent';
    return p.abnormalSemen ? 'treat' : 'observe';
  },
  schematic(st, p) { return { kind: 'genital', panel: null, testis: { varicocele: st.done ? 0 : p.grade === 'subclinical' ? 0.2 : +p.grade / 3, small: p.adolescent && st.asym > 20, scar: st.done ? (p.treatment === 'microsurgery' ? 'subinguinal' : 'embolization') : null, coil: st.done && p.treatment === 'embolization' }, badges: [{ key: 'conc', value: st.conc }] }; },
};

// ---------------------------------------------------------------------------
// Hydrocele (months)
// ---------------------------------------------------------------------------
export const hydrocele = {
  id: 'hydrocele', mode: 'benign', unit: 'mo', tMax: 24, dt: 0.1, view: 'testis',
  params: [
    { key: 'type', type: 'select', options: ['communicating', 'adult', 'secondary'], def: 'adult' },
    { key: 'volume', type: 'range', min: 20, max: 500, step: 10, def: 150, unit: 'mL' },
    { key: 'symptomatic', type: 'bool', def: true },
  ],
  series: [
    { key: 'fluid', unit: 'mL', min: 0 },
    { key: 'resolved', unit: '%', min: 0, max: 100 },
  ],
  init(p) { return { fluid: p.volume, resolved: 0, done: false, us: false }; },
  step(st, t, dt, p, arm, emit) {
    if (t >= 0.2 && !st.us) { st.us = true; emit(p.type === 'secondary' ? 'ultrasoundCause' : 'ultrasound'); }
    if (p.type === 'communicating') {
      // infant hydrocele with a patent processus vaginalis: most close by 12–24 months
      const surgeryAt = 12;
      if (arm === 'treated' && !st.done && t >= surgeryAt) { st.done = true; emit('herniotomy'); st.resolved = 1; }
      st.resolved = st.done ? 1 : 1 - (1 - st.resolved) * Math.exp(-dt / 9);
      st.fluid = st.done ? relax(st.fluid, 0, dt, 0.3) : p.volume * (1 - st.resolved) * (1 + 0.2 * Math.sin(t * 6));
    } else if (p.type === 'adult') {
      if (arm === 'treated' && !st.done && t >= 1) { st.done = true; emit(p.symptomatic ? 'hydrocelectomy' : 'asymptomaticSurgery'); }
      st.fluid = st.done ? relax(st.fluid, 0, dt, 0.5) : st.fluid * Math.exp(0.025 * dt);
      st.resolved = st.done ? relax(st.resolved, 0.95, dt, 0.5) : 0;
      if (st.fluid > 300) emit('large');
    } else {
      if (arm === 'treated' && !st.done && t >= 0.5) { st.done = true; emit('treatCause'); }
      st.fluid = st.done ? relax(st.fluid, p.volume * 0.15, dt, 2) : st.fluid * Math.exp(0.03 * dt);
      st.resolved = st.done ? relax(st.resolved, 0.8, dt, 2) : 0;
    }
    return st;
  },
  steps(st, p) {
    const k = [p.type === 'communicating' ? 'patent' : p.type === 'adult' ? 'imbalance' : 'reactive', 'transillumination'];
    if (st.us) k.push('ultrasound');
    if (st.done) k.push(p.type === 'communicating' ? 'herniotomy' : p.type === 'adult' ? 'hydrocelectomy' : 'cause');
    return k;
  },
  get: { resolved: (st) => st.resolved * 100 },
  gauges(st) { return [{ key: 'fluid', value: st.fluid, unit: 'mL', lo: 0, hi: 0, band: false }]; },
  decision(st, p) { return p.type; },
  schematic(st, p) { return { kind: 'genital', panel: null, testis: { hydrocele: st.fluid, communicating: p.type === 'communicating' && !st.done, scar: st.done ? (p.type === 'communicating' ? 'inguinal' : 'scrotal') : null, tumour: p.type === 'secondary' && !st.done ? { size: 1.5, hist: 'seminoma' } : null } }; },
};

// ---------------------------------------------------------------------------
// Phimosis, paraphimosis and lichen sclerosus (months)
// ---------------------------------------------------------------------------
/** Probability that the foreskin is retractable at a given age (physiological adhesions resolve by adolescence). */
export const retractableAt = (age) => logistic(age, 7, 2.6);
export const phimosis = {
  id: 'phimosis', mode: 'benign', unit: 'mo', tMax: 24, dt: 0.1, view: 'penis',
  params: [
    { key: 'type', type: 'select', options: ['physiological', 'pathological', 'lichenSclerosus'], def: 'physiological' },
    { key: 'age', type: 'range', min: 1, max: 70, step: 1, def: 4, unit: 'y' },
    { key: 'recurrentBalanitis', type: 'bool', def: false },
    { key: 'forcedRetraction', type: 'bool', def: false },
    { key: 'treatment', type: 'select', options: ['steroid', 'circumcision'], def: 'steroid' },
  ],
  series: [
    { key: 'retract', unit: '%', min: 0, max: 100 },
    { key: 'meatal', unit: '%', min: 0, max: 100 },
  ],
  init(p) { return { R: p.type === 'physiological' ? retractableAt(p.age) : 0.05, meatal: p.type === 'lichenSclerosus' ? 0.1 : 0, circ: false, steroid: false, para: false, reduced: false, ischaemia: 0 }; },
  step(st, t, dt, p, arm, emit) {
    if (p.forcedRetraction && !st.para && t >= 0.3) { st.para = true; emit('paraphimosis'); }
    if (st.para && arm === 'treated' && !st.reduced && t >= 0.35) { st.reduced = true; emit('manualReduction'); }
    if (st.para && !st.reduced) { st.ischaemia = Math.min(1, st.ischaemia + 0.5 * dt); if (st.ischaemia > 0.2) emit('glansIschaemia'); }
    if (arm === 'treated' && t >= 0.5 && !st.steroid && !st.circ) {
      if (p.treatment === 'circumcision') {
        st.circ = true; emit('circumcision');
        if (p.type === 'physiological' && !p.recurrentBalanitis && p.age < 10) emit('unnecessary');
        if (p.type === 'lichenSclerosus') emit('histology');
      } else { st.steroid = true; emit('steroid'); if (p.type === 'lichenSclerosus') emit('steroidLs'); }
    }
    const age = p.age + t / 12;
    if (st.circ) st.R = relax(st.R, 1, dt, 0.3);
    else if (st.steroid) st.R = relax(st.R, p.type === 'physiological' ? 0.88 : p.type === 'pathological' ? 0.5 : 0.35, dt, 1.5);
    else st.R = p.type === 'physiological' ? Math.max(st.R, retractableAt(age)) : relax(st.R, 0.02, dt, 24);
    if (p.type === 'lichenSclerosus') st.meatal = st.circ || st.steroid ? relax(st.meatal, st.circ ? 0.12 : 0.15, dt, 6) : Math.min(0.6, st.meatal + 0.012 * dt);
    if (st.meatal > 0.2) emit('meatalStenosis');
    return st;
  },
  steps(st, p) {
    const k = [p.type === 'physiological' ? 'adhesions' : p.type === 'pathological' ? 'scar' : 'ls'];
    if (st.para) k.push(st.reduced ? 'reduced' : 'paraphimosis');
    if (st.steroid) k.push('steroid');
    if (st.circ) k.push('circumcision');
    if (st.meatal > 0.2) k.push('meatal');
    return k;
  },
  get: { retract: (st) => st.R * 100, meatal: (st) => st.meatal * 100 },
  gauges(st, p) { return [{ key: 'expected', value: retractableAt(p.age) * 100, unit: '%', lo: 0, hi: 0, band: false }]; },
  decision(st, p) {
    if (p.forcedRetraction) return 'paraphimosis';
    if (p.type === 'lichenSclerosus') return 'ls';
    if (p.type === 'pathological' || p.recurrentBalanitis) return 'pathological';
    return 'physiological';
  },
  schematic(st, p) { return { kind: 'genital', panel: null, penis: { prepuce: st.circ ? 'circumcised' : st.para && !st.reduced ? 'paraphimosis' : st.R > 0.6 ? 'normal' : 'tight', ls: p.type === 'lichenSclerosus' && !st.circ, meatus: st.meatal > 0.2 ? 'stenosis' : 'normal', ischaemia: st.ischaemia }, child: p.age < 12 }; },
};

// ---------------------------------------------------------------------------
// Peyronie's disease (months)
// ---------------------------------------------------------------------------
export const peyronie = {
  id: 'peyronie', mode: 'benign', unit: 'mo', tMax: 30, dt: 0.1, view: 'penis',
  params: [
    { key: 'curvature0', type: 'range', min: 10, max: 90, step: 5, def: 40, unit: '°' },
    { key: 'ed', type: 'bool', def: false },
    { key: 'hourglass', type: 'bool', def: false },
    { key: 'treatment', type: 'select', options: ['plication', 'grafting', 'prosthesis', 'traction'], def: 'plication' },
  ],
  series: [
    { key: 'curv', unit: '°', min: 0, max: 120 },
    { key: 'pain', unit: '/10', min: 0, max: 10 },
    { key: 'length', unit: 'cm', min: 0 },
  ],
  init(p) { return { curv: p.curvature0, pain: 5, len: 13, erect: p.ed ? 0.4 : 0.9, done: false, stable: false }; },
  step(st, t, dt, p, arm, emit) {
    // active phase (≈ 12 months): pain and progression; then stable. Natural history: ≈ 50 % progress, ≈ 40 % stable, ≈ 10 % improve.
    const active = t < 12;
    if (!active && !st.stable) { st.stable = true; emit('stable'); }
    st.pain = relax(st.pain, active ? 4 : 0.3, dt, active ? 8 : 2);
    if (!st.done) { st.curv = Math.min(110, st.curv + (active ? 0.7 : 0) * dt); st.len = Math.max(9, st.len - (active ? 0.06 : 0) * dt); }
    if (arm === 'treated') {
      if (p.treatment === 'traction' && t >= 1 && !st.done) { st.trac = true; emit('traction'); }
      if (st.trac) { st.curv = Math.max(5, st.curv - 0.9 * dt); st.len = Math.min(14, st.len + 0.05 * dt); if (t > 7) { st.trac = false; st.done = true; } }
      if (['plication', 'grafting', 'prosthesis'].includes(p.treatment) && !st.done && t >= 15) {
        st.done = true; emit(p.treatment);
        if (p.treatment === 'plication') { st.curv = 5; st.len -= 1.5; if (p.curvature0 > 60 || p.hourglass) emit('plicationLimits'); if (p.ed) emit('edUntreated'); }
        if (p.treatment === 'grafting') { st.curv = 10; st.erect *= 0.8; if (p.ed) emit('edUntreated'); }
        if (p.treatment === 'prosthesis') { st.curv = 12; st.erect = 0.95; if (!p.ed) emit('prosthesisWithoutEd'); }
      }
    }
    if (active && t >= 0.1) emit('activePhase');
    if (st.curv > 60) emit('severe');
    return st;
  },
  steps(st, p) {
    const k = ['plaque', 'active'];
    if (st.stable) k.push('stable');
    if (st.done || st.trac) k.push(p.treatment === 'traction' ? 'traction' : 'surgery');
    return k;
  },
  get: { length: (st) => st.len },
  gauges(st, p) { return [{ key: 'erection', value: st.erect * 100, unit: '%', lo: 70, hi: 100 }]; },
  decision(st, p) {
    if (p.ed) return 'prosthesis';
    return p.curvature0 > 60 || p.hourglass ? 'grafting' : 'plication';
  },
  schematic(st, p) { return { kind: 'genital', panel: null, penis: { curvature: st.curv, plaque: true, erect: true, length: st.len / 13, prosthesis: st.done && p.treatment === 'prosthesis', graft: st.done && p.treatment === 'grafting' }, badges: [{ key: 'curv', value: st.curv }] }; },
};

// ---------------------------------------------------------------------------
// Hypospadias and epispadias (years of age)
// ---------------------------------------------------------------------------
const MEATUS_COMP = { distal: 0.08, midshaft: 0.15, proximal: 0.4, epispadias: 0.3 };
export const hypospadias = {
  id: 'hypospadias', mode: 'benign', unit: 'y', tMax: 18, dt: 0.05, view: 'penis',
  params: [
    { key: 'meatus', type: 'select', options: ['distal', 'midshaft', 'proximal', 'epispadias'], def: 'distal' },
    { key: 'chordee', type: 'bool', def: false },
    { key: 'undescended', type: 'bool', def: false },
    { key: 'ageSurgery', type: 'range', min: 0.5, max: 6, step: 0.5, def: 1, unit: 'y' },
  ],
  series: [
    { key: 'function', unit: '%', min: 0, max: 100 },
    { key: 'complications', unit: '%', min: 0, max: 100 },
  ],
  init(p) { return { fn: { distal: 75, midshaft: 55, proximal: 25, epispadias: 35 }[p.meatus] - (p.chordee ? 15 : 0), comp: 0, done: false }; },
  step(st, t, dt, p, arm, emit) {
    if (p.undescended && p.meatus !== 'epispadias') emit('dsd');
    if (p.meatus === 'epispadias') emit('exstrophy');
    if (t >= 0.1) emit('noCircumcision');
    if (arm === 'treated' && !st.done && t >= p.ageSurgery) {
      st.done = true; emit(p.meatus === 'proximal' || (p.chordee && p.meatus !== 'distal') ? 'twoStage' : p.meatus === 'epispadias' ? 'epispadiasRepair' : 'tip');
      if (p.ageSurgery > 1.5) emit('lateRepair');
      st.compTarget = Math.min(0.45, MEATUS_COMP[p.meatus] * (p.chordee ? 1.3 : 1));
    }
    if (st.done) { st.fn = relax(st.fn, 92 - st.compTarget * 30, dt, 0.5); st.comp += (st.compTarget - st.comp) * (1 - Math.exp(-dt / 1.5)); if (st.comp > 0.1) emit('fistula'); }
    else if (t > 3) emit('standingVoid');
    return st;
  },
  steps(st, p) {
    const k = [p.meatus === 'epispadias' ? 'dorsal' : 'ventral'];
    if (p.chordee) k.push('chordee');
    if (st.done) k.push('repair');
    if (st.comp > 0.05) k.push('complications');
    return k;
  },
  get: { function: (st) => st.fn, complications: (st) => st.comp * 100 },
  gauges(st, p) { return [{ key: 'reoperation', value: Math.min(0.45, MEATUS_COMP[p.meatus] * (p.chordee ? 1.3 : 1)) * 100, unit: '%', lo: 0, hi: 0, band: false }]; },
  decision(st, p) { return p.undescended && p.meatus !== 'epispadias' ? 'dsd' : p.meatus; },
  schematic(st, p) { return { kind: 'genital', panel: null, penis: { meatus: st.done ? 'normal' : p.meatus, curvature: st.done ? 0 : p.chordee ? -35 : 0, erect: p.chordee && !st.done, prepuce: st.done ? 'circumcised' : p.meatus === 'epispadias' ? 'normal' : 'hooded' }, child: true, testis: { pos: p.undescended ? 'inguinal' : 'scrotal' } }; },
};

export const BENIGN = [acuteScrotum, cryptorchidism, varicocele, hydrocele, phimosis, peyronie, hypospadias];
