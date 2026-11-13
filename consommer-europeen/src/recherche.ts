// Moteur de recherche « Consommer européen »
// Index tokenisé construit une fois (et à chaque rechargement des données),
// score explicite par champ, ET avant OU, tolérance aux fautes de frappe.
// Aucune dépendance : fonctions pures, testables sans serveur.

export interface GroupeIndexable {
  id: string;
  groupe: string;
  marques: string[];
  aliases?: string[];
  commentaire: string;
  siege: string;
  lieux_production: string[];
  produits: { nom: string }[];
  statut: string;
}

export interface SecteurIndexable<G extends GroupeIndexable> {
  id: string;
  num: string;
  nom: string;
  keywords?: string[];
  aliases?: string[];
  groupes: G[];
}

/** Minuscules, sans accents, sans apostrophes ni « & » (h&m → hm, l'oréal → loreal). */
export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'&]/g, '');
}

/** Minuscules en conservant les accents (pour distinguer « thé » de l'article anglais « the »). */
function brut(s: string): string {
  return s.toLowerCase().normalize('NFC').replace(/[’'&]/g, '');
}

/** Pluriel simple : retire un s ou un x final au-delà de 3 lettres. */
export function stem(w: string): string {
  return w.length > 3 ? w.replace(/(s|x)$/, '') : w;
}

const decouper = (s: string) => s.split(/[^a-z0-9]+/).filter(Boolean);
const decouperBrut = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Mots vides : ignorés dans la requête (sauf s'ils portaient un accent, cf. « thé »). */
export const MOTS_VIDES = new Set([
  'the', 'and', 'for', 'with', 'of', 'les', 'des', 'une', 'un', 'est', 'sur', 'aux', 'par', 'pas', 'plus', 'mais',
  'dont', 'avec', 'que', 'qui', 'quoi', 'son', 'ses', 'de', 'du', 'la', 'le', 'en', 'au', 'a', 'et', 'ou', 'ce',
  'cet', 'cette', 'ces', 'se', 'ne', 'y', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'leur', 'leurs',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'pour', 'dans', 'chez', 'sans', 'tres', 'marque', 'marques',
]);

/** Mots « mous » : ils affinent le classement mais ne sont jamais exigés. */
export const MOTS_MOUS = new Set([
  'femme', 'homme', 'enfant', 'bebe', 'ado', 'adulte', 'unisexe', 'cuir', 'daim', 'nubuck', 'suede', 'synthetique',
  'coton', 'laine', 'maille', 'plastique', 'caoutchouc', 'bois', 'metal', 'aluminium', 'verre', 'goretex', 'acier', 'inox',
]);

interface NomForme { complet: string; compact: string; coeur: string; coeurCompact: string }

interface Entree<G extends GroupeIndexable, S extends SecteurIndexable<G>> {
  g: G;
  s: S;
  noms: NomForme[];
  tokNom: Set<string>;
  listeNom: string[];
  brutNom: Set<string>;
  phrAlias: Set<string>;
  tokAlias: Set<string>;
  brutAlias: Set<string>;
  tokCtx: Set<string>;
  tokProd: Set<string>;
  tokSect: Set<string>;
  nomSecteur: string;
}

interface Mot { n: string; st: string; brutSt: string; aliasSeul: boolean; syn: string[] }

export interface ResultatRecherche<G extends GroupeIndexable, S extends SecteurIndexable<G>> {
  q: string;
  corrige: string | null;
  vide: boolean;
  secteurs: S[];
  recommandes: { g: G; s: S; score: number }[];
  masques: { g: G; s: S; score: number }[];
}

const SCORE = {
  nomExact: 100,
  nomPrefixe: 90,
  nomTousMots: 85,
  saisiePartielle: 80,
  aliasExact: 75,
  nomOuAlias: 70,
  avecSecteur: 60,
  contexte: 35,
  produit: 20,
  bonusSecteur: 10,
  bonusMou: 8,
  secteurEntier: 70, // tous les mots désignent le secteur du groupe (« parfum » → Beauté) et le groupe les mentionne
  malusSynonyme: 5,
  seuilBruit: 50, // si une correspondance forte existe, les résultats sous ce seuil sont écartés
  seuilFort: 85,
};

export class MoteurRecherche<G extends GroupeIndexable, S extends SecteurIndexable<G>> {
  private entrees: Entree<G, S>[] = [];
  private vocab = new Map<string, number>(); // mots de noms et d'alias, pour corriger les fautes
  private tokSecteurs = new Map<string, Set<string>>();

  constructor(private synonymes: Record<string, string[]>) {}

  /** (Re)construit l'index. À appeler au démarrage et après chaque modification des données. */
  indexer(secteurs: S[]): void {
    this.entrees = [];
    this.vocab.clear();
    this.tokSecteurs.clear();
    for (const s of secteurs) {
      const tokSect = new Set<string>();
      for (const t of [s.nom, ...(s.keywords ?? []), ...(s.aliases ?? [])]) for (const w of decouper(norm(t))) tokSect.add(stem(w));
      this.tokSecteurs.set(s.id, tokSect);
      for (const g of s.groupes) {
        const nomsBruts = [g.groupe, ...g.marques];
        const noms: NomForme[] = nomsBruts.map((x) => {
          const complet = decouper(norm(x)).join(' ');
          const coeur = decouper(norm(x.replace(/\([^)]*\)/g, ' '))).join(' ');
          return { complet, compact: complet.replace(/ /g, ''), coeur, coeurCompact: coeur.replace(/ /g, '') };
        });
        const listeNom = [...new Set(nomsBruts.flatMap((x) => decouper(norm(x))))];
        const tokNom = new Set(listeNom.map(stem));
        for (const nf of noms) if (nf.compact.length >= 2) tokNom.add(nf.compact); // « h&m » → « hm », « coca-cola » → « cocacola »
        const brutNom = new Set(nomsBruts.flatMap((x) => decouperBrut(brut(x))).map(stem));
        const aliases = g.aliases ?? [];
        const phrAlias = new Set(aliases.map((a) => decouper(norm(a)).join(' ')).filter(Boolean));
        const tokAlias = new Set(aliases.flatMap((a) => decouper(norm(a))).map(stem));
        for (const p of phrAlias) tokAlias.add(p.replace(/ /g, ''));
        const brutAlias = new Set(aliases.flatMap((a) => decouperBrut(brut(a))).map(stem));
        const tokCtx = new Set(
          decouper(norm([g.commentaire, g.siege, ...g.lieux_production].join(' ')))
            .filter((w) => w.length >= 3 && !/^\d+$/.test(w))
            .map(stem),
        );
        const tokProd = new Set(g.produits.flatMap((p) => decouper(norm(p.nom ?? ''))).filter((w) => w.length >= 3).map(stem));
        this.entrees.push({ g, s, noms, tokNom, listeNom, brutNom, phrAlias, tokAlias, brutAlias, tokCtx, tokProd, tokSect, nomSecteur: decouper(norm(s.nom)).join(' ') });
        for (const w of [...listeNom, ...aliases.flatMap((a) => decouper(norm(a)))]) {
          if (w.length >= 4 && !/\d/.test(w)) this.vocab.set(w, (this.vocab.get(w) ?? 0) + 1);
        }
      }
    }
  }

  private analyser(qBrut: string): { forts: Mot[]; mous: Mot[]; qTous: string; qCompact: string; qComplet: string } {
    const forts: Mot[] = [];
    const mous: Mot[] = [];
    const complet = decouper(norm(qBrut)).join(' '); // requête entière, mots vides compris (« le chat », « moto g »)
    for (const tb of decouperBrut(brut(qBrut))) {
      const n = norm(tb);
      if (!n) continue;
      const synBruts = this.synonymes[tb] ?? this.synonymes[n] ?? [];
      const syn = [...new Set(synBruts.map(norm).filter((v) => v && v !== n && !MOTS_VIDES.has(v)).map(stem))];
      const mot: Mot = { n, st: stem(n), brutSt: stem(tb), aliasSeul: false, syn };
      if (MOTS_VIDES.has(n)) {
        if (tb !== n) forts.push({ ...mot, aliasSeul: true }); // « thé » : accentué, ce n'est pas l'article « the »
        continue;
      }
      if (n.length < 2) continue;
      if (MOTS_MOUS.has(n)) mous.push(mot);
      else forts.push(mot);
    }
    const tous = [...forts, ...mous].map((m) => m.n);
    return { forts, mous, qTous: tous.join(' '), qCompact: tous.join(''), qComplet: complet };
  }

  /** Le mot est-il présent dans ce champ ? (0 = non, 1 = oui, 2 = oui via un synonyme) */
  private present(m: Mot, tok: Set<string>, brutTok?: Set<string>): 0 | 1 | 2 {
    if (m.aliasSeul) {
      if (brutTok && brutTok.has(m.brutSt)) return 1;
      return m.syn.some((v) => tok.has(v)) ? 2 : 0;
    }
    if (tok.has(m.st) || tok.has(m.n)) return 1;
    return m.syn.some((v) => tok.has(v)) ? 2 : 0;
  }

  private noter(e: Entree<G, S>, forts: Mot[], mous: Mot[], qTous: string, qCompact: string, qComplet: string): number {
    let score = 0;
    let viaSynonyme = false;
    // 1. Nom exact ou début de nom (sur la requête complète, mots mous compris).
    //    Ignoré si la requête contient un mot vide accentué (« thé ») : sinon « The Coca-Cola Company » sortirait.
    for (const nf of forts.some((m) => m.aliasSeul) ? [] : e.noms) {
      if (nf.complet === qTous || nf.coeur === qTous || nf.complet === qComplet || nf.coeur === qComplet || (qCompact.length >= 2 && (nf.compact === qCompact || nf.coeurCompact === qCompact))) score = Math.max(score, SCORE.nomExact);
      else if (qTous.length >= 3 && (nf.complet.startsWith(qTous + ' ') || nf.coeur.startsWith(qTous + ' ') || (qCompact.length >= 4 && nf.coeurCompact.startsWith(qCompact)))) score = Math.max(score, SCORE.nomPrefixe);
    }
    if (forts.length === 0) return score;
    if (score < SCORE.secteurEntier && e.nomSecteur === qComplet) score = SCORE.secteurEntier; // la requête est le nom exact du secteur
    const court = (m: Mot) => m.n.length < 3 && !m.aliasSeul; // sigles de 2 lettres : noms et alias seulement
    // 2. Couverture des mots forts, champ par champ
    const nom = forts.map((m) => this.present(m, e.tokNom, e.brutNom));
    const alias = forts.map((m) => (e.phrAlias.has(m.n) ? 1 : this.present(m, e.tokAlias, e.brutAlias)));
    const sect = forts.map((m) => (court(m) ? 0 : this.present(m, e.tokSect)));
    const ctx = forts.map((m) => (court(m) || m.aliasSeul ? 0 : this.present(m, e.tokCtx)));
    const prod = forts.map((m) => (court(m) || m.aliasSeul ? 0 : this.present(m, e.tokProd)));
    const tous = (...champs: (0 | 1 | 2)[][]) => forts.every((_, i) => champs.some((c) => c[i] > 0));
    const unDans = (...champs: (0 | 1 | 2)[][]) => forts.some((_, i) => champs.some((c) => c[i] > 0));
    if (tous(nom)) score = Math.max(score, SCORE.nomTousMots);
    if (forts.length === 1 && score < SCORE.saisiePartielle) {
      const m = forts[0];
      if (!m.aliasSeul && m.n.length >= 3 && e.listeNom.some((t) => t.startsWith(m.n))) score = SCORE.saisiePartielle; // saisie en cours : « nestl », « peug »
    }
    if (score < SCORE.aliasExact && e.phrAlias.has(forts.map((m) => m.n).join(' '))) score = SCORE.aliasExact;
    if (score < SCORE.nomOuAlias && tous(nom, alias)) score = SCORE.nomOuAlias;
    if (score < SCORE.avecSecteur && tous(nom, alias, sect) && unDans(nom, alias)) score = SCORE.avecSecteur;
    if (score < SCORE.secteurEntier && tous(sect) && unDans(nom, alias, ctx, prod)) score = SCORE.secteurEntier;
    if (score < SCORE.contexte && tous(nom, alias, sect, ctx) && unDans(nom, alias, ctx)) score = SCORE.contexte;
    if (score < SCORE.produit && tous(nom, alias, sect, ctx, prod) && unDans(nom, alias, ctx, prod)) score = SCORE.produit;
    if (score === 0) return 0;
    // 3. Ajustements
    viaSynonyme = forts.every((_, i) => [nom, alias, sect, ctx, prod].every((c) => c[i] !== 1)) && forts.some((_, i) => [nom, alias, sect, ctx, prod].some((c) => c[i] === 2));
    if (viaSynonyme && score < SCORE.nomExact) score -= SCORE.malusSynonyme;
    if (score < SCORE.nomExact && unDans(sect)) score = Math.min(99, score + SCORE.bonusSecteur);
    if (mous.length > 0 && score < SCORE.nomExact) {
      const tok = new Set([...e.tokNom, ...e.tokAlias, ...e.tokProd, ...e.tokCtx]);
      if (mous.every((m) => tok.has(m.st) || e.phrAlias.has(m.n))) score = Math.min(99, score + SCORE.bonusMou);
    }
    return score;
  }

  /** Correspondance partielle (OU) pour les requêtes à plusieurs mots : un mot au moins doit être dans un nom ou un alias. */
  private noterPartiel(e: Entree<G, S>, forts: Mot[]): number {
    let surNom = 0;
    let ailleurs = 0;
    for (const m of forts) {
      if (this.present(m, e.tokNom, e.brutNom) > 0 || this.present(m, e.tokAlias, e.brutAlias) > 0) surNom++;
      else if (m.n.length >= 3 && !m.aliasSeul && (this.present(m, e.tokCtx) > 0 || this.present(m, e.tokProd) > 0)) ailleurs++;
    }
    if (surNom === 0 || surNom + ailleurs < Math.ceil(forts.length / 2)) return 0;
    return Math.min(45, Math.round(10 + (30 * surNom) / forts.length + (10 * ailleurs) / forts.length));
  }

  private corriger(forts: Mot[]): Mot[] | null {
    let change = false;
    const sortie = forts.map((m) => {
      if (m.aliasSeul || m.n.length < 4 || m.n.length > 20 || this.vocab.has(m.n)) return m;
      const maxD = m.n.length <= 5 ? 1 : 2;
      let meilleur: { w: string; d: number; f: number } | null = null;
      for (const [w, f] of this.vocab) {
        if (Math.abs(w.length - m.n.length) > maxD) continue;
        const d = distance(m.n, w, maxD);
        if (d > maxD) continue;
        const bonus = w[0] === m.n[0] ? 0 : 0.5;
        if (!meilleur || d + bonus < meilleur.d || (d + bonus === meilleur.d && f > meilleur.f)) meilleur = { w, d: d + bonus, f };
      }
      if (!meilleur) return m;
      change = true;
      return { ...m, n: meilleur.w, st: stem(meilleur.w), brutSt: stem(meilleur.w), syn: [] };
    });
    return change ? sortie : null;
  }

  rechercher(qBrut: string, estRecommande: (g: G, s: S) => boolean, limite = 100): ResultatRecherche<G, S> {
    const { forts, mous, qTous, qCompact, qComplet } = this.analyser(qBrut.slice(0, 80));
    const vide: ResultatRecherche<G, S> = { q: qTous, corrige: null, vide: true, secteurs: [], recommandes: [], masques: [] };
    if (forts.length === 0) {
      // Uniquement des mots vides, mous ou d'une lettre : seul un nom exact compte (« On », « E.ON », « Maille », « P.O.L »).
      const compact = qComplet.replace(/ /g, '');
      if (compact.length < 2) return vide;
      const exacts = this.entrees.filter((e) => e.noms.some((nf) => nf.complet === qComplet || nf.coeur === qComplet || nf.compact === compact || nf.coeurCompact === compact));
      if (exacts.length === 0) return vide;
      const recommandes: { g: G; s: S; score: number }[] = [];
      const masques: { g: G; s: S; score: number }[] = [];
      for (const e of exacts) (estRecommande(e.g, e.s) ? recommandes : masques).push({ g: e.g, s: e.s, score: SCORE.nomExact });
      return { q: qComplet, corrige: null, vide: false, secteurs: [], recommandes: recommandes.slice(0, limite), masques };
    }
    const res = this.executer(forts, mous, qTous, qCompact, qComplet, estRecommande, limite);
    if (res.recommandes.length === 0 && res.masques.length === 0 && forts.length <= 2) {
      // Faute de frappe probable : on ne garde la correction que si elle retrouve un nom ou un alias.
      const corrige = this.corriger(forts);
      if (corrige) {
        const qC = [...corrige, ...mous].map((m) => m.n);
        const res2 = this.executer(corrige, mous, qC.join(' '), qC.join(''), qC.join(' '), estRecommande, limite);
        const meilleur = Math.max(0, ...res2.recommandes.map((x) => x.score), ...res2.masques.map((x) => x.score));
        if (meilleur >= SCORE.nomOuAlias) return { ...res2, corrige: corrige.map((m) => m.n).join(' ') };
      }
    }
    return res;
  }

  private executer(forts: Mot[], mous: Mot[], qTous: string, qCompact: string, qComplet: string, estRecommande: (g: G, s: S) => boolean, limite: number): ResultatRecherche<G, S> {
    let notes = this.entrees.map((e) => ({ e, score: this.noter(e, forts, mous, qTous, qCompact, qComplet) })).filter((x) => x.score > 0);
    const meilleurComplet = notes.reduce((m, x) => Math.max(m, x.score), 0);
    if (forts.length > 1 && meilleurComplet < SCORE.contexte) {
      // Aucun résultat solide avec tous les mots (« kinder bueno ») : on ajoute les marques qui en portent une partie dans leur nom.
      const deja = new Set(notes.map((x) => x.e));
      for (const e of this.entrees) {
        if (deja.has(e)) continue;
        const sc = this.noterPartiel(e, forts);
        if (sc > 0) notes.push({ e, score: sc });
      }
    }
    const meilleur = notes.reduce((m, x) => Math.max(m, x.score), 0);
    if (meilleur >= SCORE.seuilFort) notes = notes.filter((x) => x.score >= SCORE.seuilBruit); // retire le bruit (produits, mentions) quand une marque correspond
    const ordre = ['rang1', 'rang2', 'vigilance', 'hors_zones', 'a_ecarter', 'propose'];
    notes.sort((a, b) => b.score - a.score || ordre.indexOf(a.e.g.statut) - ordre.indexOf(b.e.g.statut) || a.e.g.groupe.localeCompare(b.e.g.groupe));
    const recommandes: { g: G; s: S; score: number }[] = [];
    const masques: { g: G; s: S; score: number }[] = [];
    for (const { e, score } of notes) (estRecommande(e.g, e.s) ? recommandes : masques).push({ g: e.g, s: e.s, score });
    const secteursVus = new Set<string>();
    const secteurs: S[] = [];
    for (const e of this.entrees) {
      if (secteursVus.has(e.s.id)) continue;
      secteursVus.add(e.s.id);
      const tok = this.tokSecteurs.get(e.s.id) ?? new Set<string>();
      if (forts.every((m) => m.n.length >= 3 && this.present(m, tok) > 0)) secteurs.push(e.s);
    }
    return { q: qTous, corrige: null, vide: false, secteurs, recommandes: recommandes.slice(0, limite), masques };
  }
}

/** Distance de Levenshtein avec arrêt anticipé au-delà de max. */
export function distance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    let minLigne = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cour.push(v);
      if (v < minLigne) minLigne = v;
    }
    if (minLigne > max) return max + 1;
    prec = cour;
  }
  return prec[b.length];
}
