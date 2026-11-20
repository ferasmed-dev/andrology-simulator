import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, runBoth, defaults, sanitize, ENTITIES, ENTITY, MODES, PRESETS, decision, tumours as TU, benign as BE, fn as FN } from '../src/model.js';

const last = (a) => a[a.length - 1];
const has = (r, k) => r.events.some((e) => e.key === k);
const at = (r, key, time) => r.s[key][Math.round(time / (r.t[1] - r.t[0]))];

test('three blocks, 13 entities, unique ids', () => {
  assert.equal(MODES.length, 3);
  assert.equal(ENTITIES.length, 13);
  assert.equal(new Set(ENTITIES.map((e) => e.id)).size, 13);
});

test('every entity runs both arms with finite, bounded series and a genital schematic', () => {
  for (const ent of ENTITIES) for (const arm of ['untreated', 'treated']) {
    const r = run(ent, {}, arm);
    for (const sd of ent.series) for (const v of r.s[sd.key]) {
      assert.ok(Number.isFinite(v), `${ent.id}.${sd.key}`);
      if (sd.min !== undefined) assert.ok(v >= sd.min);
      if (sd.max !== undefined) assert.ok(v <= sd.max);
    }
    assert.equal(ent.schematic(last(r.states), r.p).kind, 'genital');
  }
});

test('extreme parameter values stay finite', () => {
  for (const ent of ENTITIES) for (const edge of ['min', 'max']) {
    const params = {};
    for (const d of ent.params) {
      if (d.type === 'range') params[d.key] = d[edge];
      if (d.type === 'bool') params[d.key] = edge === 'max';
      if (d.type === 'select') params[d.key] = edge === 'min' ? d.options[0] : d.options[d.options.length - 1];
    }
    for (const arm of ['untreated', 'treated']) for (const [k, a] of Object.entries(run(ent, params, arm).s)) for (const v of a) assert.ok(Number.isFinite(v), `${ent.id}.${k} ${edge}`);
  }
});

test('runs are pure and deterministic; arms start identical', () => {
  for (const ent of ENTITIES) {
    const p = defaults(ent); const copy = JSON.stringify(p);
    const a = run(ent, p, 'treated');
    assert.deepEqual(a.s, run(ent, p, 'treated').s);
    assert.equal(JSON.stringify(p), copy);
    const u = run(ent, p, 'untreated');
    for (const k of Object.keys(u.s)) assert.equal(u.s[k][0], a.s[k][0], `${ent.id}.${k}`);
  }
});

test('sanitize clamps and rejects bad input; every entity gives a decision', () => {
  const p = sanitize(ENTITY.acuteScrotum, { hoursToSurgery: 999, cause: 'x' });
  assert.equal(p.hoursToSurgery, 36); assert.equal(p.cause, 'torsion');
  for (const ent of ENTITIES) assert.equal(typeof decision(ent.id, run(ent, {}, 'treated').states.at(-1), defaults(ent)), 'string');
});

test('IGCCCG groups and stage I risk factors', () => {
  const base = { visceral: false, afp0: 500, hcg0: 1000, ldh0: 1.2 };
  assert.equal(TU.igcccg('nsgct', base), 'good');
  assert.equal(TU.igcccg('nsgct', { ...base, afp0: 2000 }), 'intermediate');
  assert.equal(TU.igcccg('nsgct', { ...base, hcg0: 60000 }), 'poor');
  assert.equal(TU.igcccg('nsgct', { ...base, visceral: true }), 'poor');
  assert.equal(TU.igcccg('seminoma', { ...base, hcg0: 60000 }), 'good');
  assert.equal(TU.igcccg('seminoma', { ...base, visceral: true }), 'intermediate');
  assert.ok(TU.stageIRelapse('nsgct', { lvi: true }) > TU.stageIRelapse('nsgct', { lvi: false }));
  assert.ok(TU.stageIRelapse('seminoma', { size: 5, rete: true }) > TU.stageIRelapse('seminoma', { size: 2, rete: false }));
});

test('tumour markers fall with their half-lives after orchiectomy (AFP slower than hCG)', () => {
  assert.ok(TU.HALF.afp > TU.HALF.hcg);
  const r = run(ENTITY.nonSeminoma, {}, 'treated');
  const a0 = at(r, 'afp', 0.25); const a1 = at(r, 'afp', 0.25 + TU.HALF.afp * 2);
  assert.ok(Math.abs((a1 - 5) / (a0 - 5) - 0.25) < 0.08, `${a0} → ${a1}`);
});

test('penile carcinoma: occult nodal risk rises with T and grade; organ-sparing only for superficial tumours', () => {
  const p = (t, g) => TU.occultNodes({ tStage: t, grade: g, hpv: false });
  assert.ok(p('T2', 2) > p('T1a', 1));
  assert.ok(p('T1a', 3) > p('T1a', 1));
  assert.ok(TU.primaryAdequate('T1a', 'organSparing') && !TU.primaryAdequate('T2', 'organSparing'));
  assert.ok(TU.primaryAdequate('T3', 'partialPenectomy') && !TU.primaryAdequate('T4', 'partialPenectomy'));
});

test('torsion: viability falls with hours of ischaemia and tighter twists', () => {
  assert.ok(BE.viability(4, 720) > 0.9);
  assert.ok(BE.viability(24, 720) < 0.05);
  assert.ok(BE.viability(10, 1080) < BE.viability(10, 360));
});

test('cryptorchidism: germ-cell loss is faster for abdominal testes; earlier orchidopexy preserves more', () => {
  const early = run(ENTITY.cryptorchidism, { ageSurgery: 1 }, 'treated');
  const late = run(ENTITY.cryptorchidism, { ageSurgery: 9 }, 'treated');
  assert.ok(last(early.s.germ) > last(late.s.germ) + 20);
  assert.ok(BE.GERM_LOSS.abdominal > BE.GERM_LOSS.inguinal);
  assert.ok(BE.testisVolume(18, 100) > 14 && BE.testisVolume(5, 100) < 2);
});

test('infertility profiles follow the hypothalamic–pituitary–testicular axis', () => {
  const P = FN.PROFILE;
  assert.ok(P.klinefelter.fsh > 2 * P.normal.fsh, 'primary failure: high FSH');
  assert.ok(P.hypogonadotropic.fsh < 1 && P.hypogonadotropic.t < 8, 'central: low FSH and T');
  assert.equal(P.obstructive.fsh, P.normal.fsh);
  assert.ok(P.anabolic.lh < 1 && P.anabolic.t > 35, 'exogenous androgen suppresses LH');
  assert.ok(FN.fecundity(40, 30) > FN.fecundity(5, 30));
  assert.ok(FN.fecundity(40, 40) < FN.fecundity(40, 30));
});

test('ED: PDE5 inhibitors are useless with nitrates; intracavernosal alprostadil does not need the NO pathway', () => {
  assert.equal(FN.GAIN.alprostadil.postProstatectomy > FN.GAIN.pde5i.postProstatectomy, true);
  const n = runBoth(ENTITY.ed, { nitrates: true });
  assert.ok(Math.abs(last(n.treated.s.iief) - last(n.untreated.s.iief)) < 0.01);
});

const EXPECT = {
  seminomaStageISurveillance: (b) => has(b.treated, 'markersNormal') && last(b.treated.s.relapse) > 8 && last(b.treated.s.relapse) < 16 && last(b.treated.s.survival) > 99,
  seminomaStageIRiskCarboplatin: (b) => last(b.treated.s.relapse) < 30 * 0.4 && decision('seminoma', b.treated.states[0], b.treated.p) === 'I_carboplatin',
  seminomaIIARadiotherapy: (b) => has(b.treated, 'rtField') && has(b.treated, 'markerPlateau') && last(b.treated.s.survival) > 98,
  seminomaAdvancedBep: (b) => last(b.untreated.s.survival) < 5 && last(b.treated.s.survival) > 93,
  seminomaStageIOvertreated: (b) => has(b.treated, 'overtreatment'),
  nsgctStageISurveillance: (b) => last(b.treated.s.relapse) > 12 && last(b.treated.s.relapse) < 18,
  nsgctStageILviBep1: (b) => last(b.treated.s.relapse) < 5,
  nsgctLviSurveillance: (b) => last(b.treated.s.relapse) > 40 && decision('nonSeminoma', b.treated.states[0], b.treated.p) === 'I_bep1',
  nsgctGoodRiskBep3: (b) => decision('nonSeminoma', b.treated.states[0], b.treated.p) === 'adv_good' && last(b.treated.s.survival) > 94,
  nsgctPoorRiskBep4: (b) => decision('nonSeminoma', b.treated.states[0], b.treated.p) === 'adv_poor' && Math.abs(last(b.treated.s.survival) - 67) < 4,
  nsgctPoorRiskBep3: (b) => has(b.treated, 'inadequate') && last(b.treated.s.survival) < last(runBoth(ENTITY.nonSeminoma, PRESETS.nsgctPoorRiskBep4.params).treated.s.survival),
  leydigSmallSparing: (b) => has(b.treated, 'sparing') && !has(b.treated, 'sparingNotIdeal') && last(b.treated.s.gyn) < 10,
  leydigMalignantOrchiectomy: (b) => has(b.treated, 'malignantFollowUp') && last(b.untreated.s.pM) > 15,
  leydigChild: (b) => b.treated.states[0].E > 40,
  penileT1aSparing: (b) => last(b.treated.s.css) > 90,
  penileT2Dsnb: (b) => has(b.treated, 'dsnb') && last(b.treated.s.css) > 90,
  penileT2NodalSurveillance: (b) => has(b.treated, 'surveillanceHighRisk') && last(b.treated.s.css) < last(runBoth(ENTITY.penile, {}).treated.s.css) - 10,
  penileT2OrganSparingWrong: (b) => has(b.treated, 'primaryInadequate') && last(b.treated.s.localRecur) > 30,
  penileCn2Ilnd: (b) => has(b.treated, 'pelvic') && last(b.treated.s.css) > 50 && last(b.untreated.s.css) < 5,
  penileT4Total: (b) => has(b.treated, 'urethrostomy') && has(b.treated, 'neoadjuvant'),
  torsionEarly: (b) => has(b.treated, 'detorsionFixation') && last(b.treated.s.viable) > 90 && last(b.untreated.s.viable) < 5,
  torsionLate: (b) => has(b.treated, 'orchiectomy'),
  torsionManualDetorsion: (b) => has(b.treated, 'manualDetorsion') && last(b.treated.s.viable) > last(runBoth(ENTITY.acuteScrotum, { hoursToSurgery: 10 }).treated.s.viable),
  torsionNeonatal: (b) => last(b.treated.s.viable) > 80,
  appendixTorsion: (b) => has(b.treated, 'conservative') && last(b.untreated.s.viable) === 100,
  epididymitisYoung: (b) => has(b.treated, 'abxSti') && b.untreated.s.perfusion[0] > 130,
  epididymitisOlder: (b) => has(b.treated, 'abxEnteric'),
  cryptorchidismEarly: (b) => has(b.treated, 'orchidopexy') && last(b.treated.s.germ) > 80 && last(b.untreated.s.germ) < 15,
  cryptorchidismLate: (b) => has(b.treated, 'late'),
  cryptorchidismAbdominal: (b) => has(b.treated, 'laparoscopy') && last(b.untreated.s.cancer) > last(runBoth(ENTITY.cryptorchidism, {}).untreated.s.cancer),
  cryptorchidismBilateral: (b) => ENTITY.cryptorchidism.gauges(b.untreated.states.at(-1), b.untreated.p)[0].value < 20,
  retractileTestis: (b) => has(b.treated, 'retractile') && last(b.untreated.s.germ) === 100,
  varicoceleInfertile: (b) => last(b.treated.s.conc) > last(b.untreated.s.conc) + 5,
  varicoceleAdolescent: (b) => has(b.untreated, 'asym20') && last(b.treated.s.asym) < 10,
  varicoceleSubclinical: (b) => has(b.treated, 'subclinicalNoBenefit') && Math.abs(last(b.treated.s.conc) - last(b.untreated.s.conc)) < 0.01,
  varicoceleRight: (b) => decision('varicocele', b.treated.states[0], b.treated.p) === 'imaging',
  hydroceleInfant: (b) => last(b.untreated.s.resolved) > 85,
  hydroceleAdult: (b) => has(b.treated, 'hydrocelectomy') && last(b.untreated.s.fluid) > 200,
  hydroceleSecondary: (b) => has(b.treated, 'ultrasoundCause'),
  phimosisPhysiological: (b) => last(b.untreated.s.retract) > b.untreated.s.retract[0] && last(b.treated.s.retract) > 80,
  phimosisPathological: (b) => last(b.untreated.s.retract) < 10 && has(b.treated, 'circumcision'),
  lichenSclerosus: (b) => has(b.untreated, 'meatalStenosis') && last(b.treated.s.meatal) < last(b.untreated.s.meatal),
  paraphimosis: (b) => has(b.untreated, 'glansIschaemia') && has(b.treated, 'manualReduction'),
  peyroniePlication: (b) => last(b.treated.s.curv) < 10 && last(b.treated.s.length) < last(b.untreated.s.length),
  peyronieSevereGraft: (b) => last(b.treated.s.curv) <= 10 && last(b.treated.s.length) >= last(b.untreated.s.length),
  peyronieWithEd: (b) => has(b.treated, 'prosthesis') && decision('peyronie', b.treated.states[0], b.treated.p) === 'prosthesis',
  hypospadiasDistal: (b) => has(b.treated, 'tip') && last(b.treated.s.complications) < 12,
  hypospadiasProximal: (b) => has(b.treated, 'twoStage') && last(b.treated.s.complications) > 25,
  hypospadiasDsd: (b) => has(b.treated, 'dsd'),
  epispadias: (b) => has(b.treated, 'exstrophy') && has(b.treated, 'epispadiasRepair'),
  hypogonadotropicGonadotropins: (b) => has(b.treated, 'hcg') && has(b.treated, 'addFsh') && last(b.treated.s.conc) > 5 && last(b.untreated.s.conc) === 0,
  kallmann: (b) => has(b.treated, 'anosmia'),
  klinefelterTese: (b) => has(b.treated, 'microTese') && has(b.treated, 'noTestosterone') && last(b.treated.s.preg) > 30,
  obstructiveAzoospermia: (b) => has(b.treated, 'retrieval') && last(b.treated.s.preg) > last(runBoth(ENTITY.infertility, { cause: 'klinefelter' }).treated.s.preg),
  anabolicSteroids: (b) => has(b.treated, 'transientHypogonadism') && last(b.treated.s.conc) > 30 && last(b.untreated.s.conc) < 2,
  varicoceleOligozoospermia: (b) => last(b.treated.s.preg) > last(b.untreated.s.preg),
  olderPartner: (b) => last(b.treated.s.preg) < last(runBoth(ENTITY.infertility, { cause: 'klinefelter' }).treated.s.preg) - 10,
  edVasculogenicPde5: (b) => has(b.treated, 'cvSentinel') && last(b.treated.s.iief) > last(b.untreated.s.iief) + 5,
  edNitrates: (b) => has(b.treated, 'nitrates'),
  edNitratesAlprostadil: (b) => last(b.treated.s.iief) > last(b.untreated.s.iief) + 5,
  edDiabeticProsthesis: (b) => has(b.treated, 'thirdLine') && last(b.treated.s.iief) >= 22,
  edPostProstatectomy: (b) => has(b.treated, 'nerveDependent') && last(b.untreated.s.iief) > b.untreated.s.iief[0],
  edHypogonadal: (b) => b.treated.states.at(-1).t > 12 && decision('ed', b.treated.states[0], b.treated.p) === 'hypogonadal',
  edPsychogenic: (b) => last(b.treated.s.iief) > 19,
};

test('every preset is valid and behaves as documented', () => {
  assert.deepEqual(Object.keys(EXPECT).sort(), Object.keys(PRESETS).sort());
  for (const [k, pr] of Object.entries(PRESETS)) {
    const ent = ENTITY[pr.entity];
    const p = sanitize(ent, pr.params);
    for (const [pk, v] of Object.entries(pr.params)) assert.equal(p[pk], v, `${k}.${pk}`);
    assert.ok(EXPECT[k](runBoth(ent, pr.params)), k);
  }
});
