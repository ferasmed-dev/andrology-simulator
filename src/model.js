// Public model API: entities by block, presets, key decisions and "Model" tags. Pure (no DOM).
export * from './model/core.js';
export * as onco from './model/onco.js';
export * as tumours from './model/tumours.js';
export * as benign from './model/benign.js';
export * as fn from './model/function.js';
import { TUMOURS } from './model/tumours.js';
import { BENIGN } from './model/benign.js';
import { FUNCTION } from './model/function.js';

export const MODES = [
  { id: 'tumours', entities: TUMOURS },
  { id: 'benign', entities: BENIGN },
  { id: 'function', entities: FUNCTION },
];
export const ENTITIES = MODES.flatMap((m) => m.entities);
export const ENTITY = Object.fromEntries(ENTITIES.map((e) => [e.id, e]));
export const modeOf = (id) => ENTITY[id]?.mode;
export const stageLabel = (v) => String(v);

/** Teaching presets; each has a deep link ?preset=<key>. Expected behaviour is checked in tests/model.test.js. */
export const PRESETS = {
  // Tumours
  seminomaStageISurveillance: { entity: 'seminoma', params: {} },
  seminomaStageIRiskCarboplatin: { entity: 'seminoma', params: { size: 5, rete: true, treatment: 'carboplatin' } },
  seminomaIIARadiotherapy: { entity: 'seminoma', params: { stage: 'IIA', treatment: 'rt' } },
  seminomaAdvancedBep: { entity: 'seminoma', params: { stage: 'III', ldh0: 3, hcg0: 200, treatment: 'bep3' } },
  seminomaStageIOvertreated: { entity: 'seminoma', params: { treatment: 'bep3' } },
  nsgctStageISurveillance: { entity: 'nonSeminoma', params: {} },
  nsgctStageILviBep1: { entity: 'nonSeminoma', params: { lvi: true, treatment: 'bep1' } },
  nsgctLviSurveillance: { entity: 'nonSeminoma', params: { lvi: true } },
  nsgctGoodRiskBep3: { entity: 'nonSeminoma', params: { stage: 'IIC', afp0: 800, hcg0: 2000, treatment: 'bep3' } },
  nsgctPoorRiskBep4: { entity: 'nonSeminoma', params: { stage: 'III', afp0: 15000, hcg0: 60000, ldh0: 6, treatment: 'bep4' } },
  nsgctPoorRiskBep3: { entity: 'nonSeminoma', params: { stage: 'III', afp0: 15000, hcg0: 60000, ldh0: 6, treatment: 'bep3' } },
  leydigSmallSparing: { entity: 'leydig', params: {} },
  leydigMalignantOrchiectomy: { entity: 'leydig', params: { size: 6, malignantFeatures: true, treatment: 'orchiectomy' } },
  leydigChild: { entity: 'leydig', params: { child: true, size: 1 } },
  penileT1aSparing: { entity: 'penile', params: { tStage: 'T1a', grade: 1, primary: 'organSparing', nodal: 'surveillance' } },
  penileT2Dsnb: { entity: 'penile', params: {} },
  penileT2NodalSurveillance: { entity: 'penile', params: { nodal: 'surveillance' } },
  penileT2OrganSparingWrong: { entity: 'penile', params: { primary: 'organSparing' } },
  penileCn2Ilnd: { entity: 'penile', params: { tStage: 'T3', cN: 'cN2', nodal: 'radicalIlnd' } },
  penileT4Total: { entity: 'penile', params: { tStage: 'T4', cN: 'cN3', grade: 3, primary: 'totalPenectomy', nodal: 'radicalIlnd' } },
  // Benign
  torsionEarly: { entity: 'acuteScrotum', params: {} },
  torsionLate: { entity: 'acuteScrotum', params: { hoursToSurgery: 18 } },
  torsionManualDetorsion: { entity: 'acuteScrotum', params: { hoursToSurgery: 10, manualDetorsion: true } },
  torsionNeonatal: { entity: 'acuteScrotum', params: { age: 1, degrees: 360, hoursToSurgery: 12 } },
  appendixTorsion: { entity: 'acuteScrotum', params: { cause: 'appendix', age: 9 } },
  epididymitisYoung: { entity: 'acuteScrotum', params: { cause: 'epididymitis', age: 24 } },
  epididymitisOlder: { entity: 'acuteScrotum', params: { cause: 'epididymitis', age: 58 } },
  cryptorchidismEarly: { entity: 'cryptorchidism', params: {} },
  cryptorchidismLate: { entity: 'cryptorchidism', params: { ageSurgery: 9 } },
  cryptorchidismAbdominal: { entity: 'cryptorchidism', params: { position: 'abdominal' } },
  cryptorchidismBilateral: { entity: 'cryptorchidism', params: { bilateral: true, ageSurgery: 6 } },
  retractileTestis: { entity: 'cryptorchidism', params: { position: 'retractile' } },
  varicoceleInfertile: { entity: 'varicocele', params: {} },
  varicoceleAdolescent: { entity: 'varicocele', params: { adolescent: true, grade: '3', abnormalSemen: false } },
  varicoceleSubclinical: { entity: 'varicocele', params: { grade: 'subclinical' } },
  varicoceleRight: { entity: 'varicocele', params: { rightSided: true } },
  hydroceleInfant: { entity: 'hydrocele', params: { type: 'communicating', volume: 40 } },
  hydroceleAdult: { entity: 'hydrocele', params: {} },
  hydroceleSecondary: { entity: 'hydrocele', params: { type: 'secondary', volume: 80 } },
  phimosisPhysiological: { entity: 'phimosis', params: {} },
  phimosisPathological: { entity: 'phimosis', params: { type: 'pathological', age: 9, treatment: 'circumcision' } },
  lichenSclerosus: { entity: 'phimosis', params: { type: 'lichenSclerosus', age: 45, treatment: 'circumcision' } },
  paraphimosis: { entity: 'phimosis', params: { type: 'pathological', age: 16, forcedRetraction: true } },
  peyroniePlication: { entity: 'peyronie', params: {} },
  peyronieSevereGraft: { entity: 'peyronie', params: { curvature0: 75, treatment: 'grafting' } },
  peyronieWithEd: { entity: 'peyronie', params: { ed: true, treatment: 'prosthesis' } },
  hypospadiasDistal: { entity: 'hypospadias', params: {} },
  hypospadiasProximal: { entity: 'hypospadias', params: { meatus: 'proximal', chordee: true } },
  hypospadiasDsd: { entity: 'hypospadias', params: { meatus: 'proximal', undescended: true } },
  epispadias: { entity: 'hypospadias', params: { meatus: 'epispadias' } },
  // Function
  hypogonadotropicGonadotropins: { entity: 'infertility', params: {} },
  kallmann: { entity: 'infertility', params: { kallmann: true } },
  klinefelterTese: { entity: 'infertility', params: { cause: 'klinefelter' } },
  obstructiveAzoospermia: { entity: 'infertility', params: { cause: 'obstructive' } },
  anabolicSteroids: { entity: 'infertility', params: { cause: 'anabolic' } },
  varicoceleOligozoospermia: { entity: 'infertility', params: { cause: 'varicocele' } },
  olderPartner: { entity: 'infertility', params: { cause: 'klinefelter', femaleAge: 40 } },
  edVasculogenicPde5: { entity: 'ed', params: {} },
  edNitrates: { entity: 'ed', params: { nitrates: true } },
  edNitratesAlprostadil: { entity: 'ed', params: { nitrates: true, treatment: 'alprostadil' } },
  edDiabeticProsthesis: { entity: 'ed', params: { cause: 'diabetic', iief0: 7, treatment: 'prosthesis' } },
  edPostProstatectomy: { entity: 'ed', params: { cause: 'postProstatectomy', iief0: 7 } },
  edHypogonadal: { entity: 'ed', params: { cause: 'hypogonadal', treatment: 'testosterone' } },
  edPsychogenic: { entity: 'ed', params: { cause: 'psychogenic', iief0: 13 } },
};

export function decision(id, st, p) { return ENTITY[id]?.decision ? ENTITY[id].decision(st, p) : null; }

/** Parameters/series that are simulator tuning choices or proxies ("Modelo" / "Model" tag in the UI). */
export const MODEL_TAGS = {
  seminoma: ['relapse'], nonSeminoma: ['relapse'], leydig: ['gyn', 'pM'], penile: ['nodal'], acuteScrotum: ['perfusion', 'viable'],
  cryptorchidism: ['germ', 'cancer'], varicocele: ['pregnancy'], hydrocele: [], phimosis: ['meatal'], peyronie: [], hypospadias: ['function'],
  infertility: ['preg'], ed: ['success'],
};
export const isModelTagged = (id, key) => (MODEL_TAGS[id] || []).includes(key);
