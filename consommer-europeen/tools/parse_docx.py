import json
import re
import unicodedata
import sys
import zipfile
from xml.etree import ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

NOMS = {
    '01': 'Automobile', '02': 'Motos et scooters', '03': 'Pneumatiques', '04': 'Électroménager',
    '05': 'Téléviseurs', '06': 'Informatique et téléphonie', '07': 'Logiciels et applications',
    '08': 'Alimentation et boissons', '09': 'Hygiène, beauté et santé', '10': 'Vêtements, chaussures et sport',
    '11': 'Voyage et plein air', '12': 'Distribution et paiement', '13': 'Télécoms, numérique et énergie',
    '14': 'Banque, assurance et épargne', '15': 'Transport et mobilité', '16': 'Hôtellerie et hébergement',
    '17': 'Jouets et jeux vidéo', '18': 'Maison, bricolage et jardin',
    '19': 'Montres, bijoux, optique et objets connectés', '20': 'Médias, streaming et culture',
    '21': 'Restauration et livraison de repas', '22': 'Sources',
}

STATUTS = {'rang 1': 'rang1', 'rang 2': 'rang2', 'vigilance': 'vigilance', 'hors zones': 'hors_zones', 'à écarter': 'a_ecarter', 'a écarter': 'a_ecarter', 'a ecarter': 'a_ecarter'}

PAYS = {
    'france': 'FR', 'allemagne': 'DE', 'pays-bas': 'NL', 'suède': 'SE', 'italie': 'IT',
    'royaume-uni': 'GB', 'suisse': 'CH', 'pologne': 'PL', 'finlande': 'FI', 'japon': 'JP',
    'corée du sud': 'KR', 'taïwan': 'TW', 'canada': 'CA', 'autriche': 'AT', 'inde': 'IN',
    'états-unis': 'US', 'chine': 'CN', 'espagne': 'ES', 'tchéquie': 'CZ', 'slovaquie': 'SK',
    'norvège': 'NO', 'belgique': 'BE', 'luxembourg': 'LU', 'bermudes': 'BM', 'estonie': 'EE',
    'qatar': 'QA', 'russie': 'RU', 'émirats arabes unis': 'AE', 'singapour': 'SG', 'europe': 'EU',
    'portugal': 'PT', 'irlande': 'IE', 'danemark': 'DK', 'grèce': 'GR', 'turquie': 'TR', 'brésil': 'BR',
}


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', norm(s)).strip('-')[:60]


def siege_code(pays):
    p = norm(pays).strip()
    if not p:
        return '??'
    if 'chinoise' in p or p.startswith('chine'):
        return 'CN'
    for key, code in PAYS.items():
        if p.startswith(key):
            return code
    return '??'


def country_like(t):
    t = norm(t).strip().strip('/').strip()
    if not t or t.endswith(',') or len(t) > 60:
        return False
    if 'chinoise' in t:
        return True
    return any(t.startswith(k) for k in PAYS)


def runs_of(p):
    out = []
    for r in p.findall(W + 'r'):
        text = ''.join((n.text or '') for n in r.iter(W + 't'))
        rpr = r.find(W + 'rPr')
        bold = False
        color = None
        if rpr is not None:
            b = rpr.find(W + 'b')
            bold = b is not None and b.get(W + 'val') not in ('0', 'false')
            c = rpr.find(W + 'color')
            if c is not None:
                color = c.get(W + 'val')
        out.append({'text': text, 'bold': bold, 'color': color})
    return out


with zipfile.ZipFile(sys.argv[1]) as z:
    xml = z.read('word/document.xml')

root = ET.fromstring(xml)
body = root.find(W + 'body')

secteurs = []
sources = {}
anomalies = []
current = None
open_row = None
pending = []


def row_has_statut(row):
    return any(norm(r['text']).strip() in STATUTS for r in row['runs'])


def make_row(row):
    texts = [r['text'] for r in row['runs']]
    si = next(i for i, t in enumerate(texts) if norm(t).strip() in STATUTS)
    groupe = texts[0].strip()
    statut = STATUTS[norm(texts[si]).strip()]
    commentaire = re.sub(r'\s+', ' ', ' '.join(t.strip() for t in texts[si + 1:])).strip()
    middle = texts[1:si]
    pi = len(middle)
    while pi > 0 and country_like(middle[pi - 1]):
        pi -= 1
    pays = re.sub(r'\s+', ' ', ' '.join(t.strip() for t in middle[pi:])).strip()
    marques_txt = re.sub(r'\s+', ' ', ' '.join(t.strip() for t in middle[:pi])).strip()
    refs = [int(n) for n in re.findall(r'\[(\d+)\]', commentaire)]
    current['groupes'].append({
        'id': current['id'] + '-' + slug(groupe),
        'groupe': groupe,
        'marques': [m.strip() for m in re.split(r'[,;]', marques_txt) if m.strip()],
        'siege': pays,
        'siege_pays': siege_code(pays),
        'statut': statut,
        'commentaire': commentaire,
        'sources': refs,
        'lieux_production': [],
        'certifications': [],
        'produits': [],
    })


def flush_open():
    global open_row
    if open_row is None:
        return
    if row_has_statut(open_row) and current is not None:
        make_row(open_row)
    elif current is not None:
        anomalies.append({'secteur': current['num'], 'brut': re.sub(r'\s+', ' ', ' '.join(r['text'] for r in open_row['runs'])).strip()[:300]})
    open_row = None


def flush_all():
    global open_row
    flush_open()
    while pending:
        r = pending.pop(0)
        if row_has_statut(r) and current is not None:
            make_row(r)
        elif current is not None:
            anomalies.append({'secteur': current['num'], 'brut': re.sub(r'\s+', ' ', ' '.join(x['text'] for x in r['runs'])).strip()[:300]})


for p in body.findall(W + 'p'):
    runs = runs_of(p)
    if not runs:
        continue
    full = re.sub(r'\s+', ' ', ''.join(r['text'] for r in runs)).strip()
    if not full:
        continue

    if re.match(r'^\[\d+\]', full):
        m = re.match(r'^\[(\d+)\]\s*(.*)$', full)
        if m:
            sources[m.group(1)] = m.group(2).strip()
        continue

    mnum = re.match(r'^(\d{2})\s', full)
    if mnum and len(re.findall(r'\b\d{2}\b', full)) == 1 and mnum.group(1) in NOMS:
        flush_all()
        pending = []
        num = mnum.group(1)
        if num == '22':
            current = None
            continue
        nom = NOMS[num]
        note = full[len(num):].strip()
        if note.startswith(nom):
            note = note[len(nom):].strip()
        current = {'num': num, 'id': slug(nom), 'nom': nom, 'note': note, 'groupes': [], 'sous_categories': []}
        secteurs.append(current)
        continue

    if current is None:
        continue
    if re.match(r'^\d{1,3}$', full):
        continue
    if 'Grille sectorielle' in full and len(full) < 70:
        continue
    if full.startswith("Document d'information"):
        continue
    if 'Groupe' in full and 'Statut' in full:
        continue

    first = runs[0]
    if first['bold'] and first['color'] == '1f2933':
        if open_row is not None:
            if row_has_statut(open_row):
                flush_open()
            else:
                pending.append(open_row)
        open_row = {'runs': list(runs)}
    else:
        if pending:
            pending[0]['runs'].extend(runs)
            if row_has_statut(pending[0]):
                r = pending.pop(0)
                make_row(r)
        elif open_row is not None:
            open_row['runs'].extend(runs)
        elif first['color'] == '14305a' and len(full) < 80 and full not in current['sous_categories']:
            current['sous_categories'].append(full)

flush_all()

out = {'secteurs': secteurs, 'sources': sources, 'anomalies': anomalies}
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

total = sum(len(s['groupes']) for s in secteurs)
statuts = {}
for s in secteurs:
    for g in s['groupes']:
        statuts[g['statut']] = statuts.get(g['statut'], 0) + 1
print('secteurs:', len(secteurs), 'total groupes:', total)
print('statuts:', statuts)
print('attendu (doc): rang1=322 rang2=119 vigilance=22 hors_zones=90 a_ecarter=62 total=615 lignes')
print('sources:', len(sources), '| anomalies:', len(anomalies))
for a in anomalies[:8]:
    print('  ANOM', a['secteur'], a['brut'][:120])
for s in secteurs:
    print(f"  {s['num']} {s['nom']}: {len(s['groupes'])}")
unk = sorted({(s['num'], g['siege']) for s in secteurs for g in s['groupes'] if g['siege_pays'] == '??'})
print('sieges ?? :', unk[:15])
