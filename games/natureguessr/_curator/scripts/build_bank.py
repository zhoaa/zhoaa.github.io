"""Build a country-first, openly licensed, model-unique curator bank.

Usage: python build_bank.py --work-dir /path/to/cache-and-natural-earth
Requires numpy, scipy, shapely, pyproj. No credentials are used.
"""
import argparse, hashlib, itertools, json, math, pathlib, random, time, unicodedata, urllib.parse, urllib.request
import numpy as np
from scipy.spatial import cKDTree
from shapely import make_valid, set_precision, STRtree
from shapely.geometry import shape, Point, LineString
from shapely.ops import nearest_points, transform, unary_union
from pyproj import Geod, Transformer

parser = argparse.ArgumentParser()
parser.add_argument('--work-dir', type=pathlib.Path, required=True)
parser.add_argument('--countries', type=int, help='Limit the shuffled country index (default: all)')
parser.add_argument('--seed', type=int, help='Repeat a particular country order')
parser.add_argument('--add', type=int, default=0, help='Append this many new candidates while preserving existing IDs')
parser.add_argument('--per-country', type=int, default=2)
args = parser.parse_args()
if (args.countries is not None and args.countries < 1) or args.per_country < 1 or args.add < 0:
    parser.error('--countries and --per-country must be positive and --add must be nonnegative')
WORK=args.work_dir;WORK.mkdir(exist_ok=True,parents=True);CACHE=WORK/'cache';CACHE.mkdir(exist_ok=True)
OUT=pathlib.Path(__file__).resolve().parents[1];G=Geod(ellps='WGS84');last_api=0
GROUPS=[('Bird','Aves'),('Mammal','Mammalia'),('Reptile / amphibian','Reptilia,Amphibia'),('Plant','Plantae'),('Fungus','Fungi')]
ALLOWED={'cc0','cc-by'}

def get(url):
    global last_api
    p=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json')
    if p.exists():return json.loads(p.read_text())
    for attempt in range(3):
        if 'api.inaturalist.org' in url:
            time.sleep(max(0,1.12-(time.monotonic()-last_api)));last_api=time.monotonic()
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'NatureGuessr-CuratorPrototype/0.1'})
            with urllib.request.urlopen(request,timeout=35) as response:data=json.load(response)
            p.write_text(json.dumps(data));return data
        except Exception as e:
            if getattr(e,'code',None)==404:return None
            if attempt==2:print('FETCH FAILED',url,str(e),flush=True);return None
            time.sleep(2*(attempt+1))

def api(path,params):
    url='https://api.inaturalist.org/v1/'+path+'?'+urllib.parse.urlencode(params)
    return get(url),url

def area(s):
    if s.is_empty:return 0
    if s.geom_type=='Polygon':return (abs(G.geometry_area_perimeter(s.exterior)[0])-sum(abs(G.geometry_area_perimeter(h)[0]) for h in s.interiors))/1e6
    if hasattr(s,'geoms'):return sum(area(g) for g in s.geoms)
    return 0

world_path=WORK/'world-10m.json'
if not world_path.exists():
    data=get('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson');world_path.write_text(json.dumps(data))
features=json.loads(world_path.read_text())['features']
countries=[];geometries=[];grouped={};country_aliases=[]
for f in features:
    p=f['properties'];iso=p.get('ISO_A3_EH',p['ADM0_A3'])
    # ISO country/territory codes, with descriptive ADMIN names. No centroid guessing.
    if iso=='-99':continue
    s=set_precision(make_valid(shape(f['geometry'])),.000001)
    grouped.setdefault(iso,[]).append((p,s))
for iso,parts in grouped.items():
    # Some Natural Earth features share an ISO country code (e.g. Australia's
    # territories). Union them once, so guesses and uniqueness use one entity.
    p,_=max(parts,key=lambda pair:pair[1].area)
    s=set_precision(make_valid(unary_union([pair[1] for pair in parts])),.000001)
    countries.append({'id':iso,'name':p['ADMIN'],'iso2':p.get('ISO_A2_EH',p.get('ISO_A2','')),'label':[p['LABEL_X'],p['LABEL_Y']],'continent':p['CONTINENT']})
    names = [p.get(key) for key in ('ADMIN', 'NAME', 'NAME_LONG', 'NAME_EN', 'FORMAL_EN')]
    country_aliases.append(list(dict.fromkeys(name for name in names if name and name != '-99')))
    geometries.append(s)
country_tree = STRtree(geometries)
country_order = list(range(len(countries)))
random.Random(args.seed).shuffle(country_order)
country_order = country_order[:args.countries]

def country_place(ci):
    aliases = country_aliases[ci]
    def normalized(name):
        return ''.join(c for c in unicodedata.normalize('NFKD', name.casefold()) if c.isalnum())
    accepted = {normalized(name) for name in aliases}
    for alias in aliases:
        data, _ = api('places/autocomplete', {'q': alias, 'per_page': 10})
        matches = {
            place['id']: place
            for place in (data or {}).get('results', [])
            if place.get('admin_level') == 0
            and any(normalized(place.get(key) or '') in accepted for key in ('name', 'display_name'))
        }
        if len(matches) == 1:
            return next(iter(matches.values()))
        if len(matches) > 1:
            return None
    return None

range_index={};bank=[];diagnostics=[];feedback={}
NAME_RULES={'South Africa':['southafrica','suidafrika'],'Australia':['australia'],'New Zealand':['newzealand','novaezeland','novazeland','aotearoa'],'Japan':['japan','japon','nippon'],'Madagascar':['madagas','malagasy'],'Taiwan':['taiwan','formosa'],'Sri Lanka':['srilanka','ceylon'],'Mexico':['mexic'],'Brazil':['brazil','brasil'],'Ecuador':['ecuador'],'Chile':['chile','chilensis'],'Costa Rica':['costaric'],'Indonesia':['indonesia'],'India':['india','indica','indicus','indicum'],'Spain':['spain','spanish','hispan'],'Colombia':['colombia','colombian']}
def name_gives_country(taxon,name):
    import re
    text=' '.join([taxon.get('preferred_common_name',taxon.get('name','')),taxon.get('name',''),taxon.get('scientific','')])
    text=re.sub('[^a-z]','',unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower())
    return any(token in text for token in NAME_RULES.get(name,[name.lower().replace(' ','')]))
if args.add and (OUT/'data.js').exists():
    previous=json.loads((OUT/'data.js').read_text().removeprefix('window.NATURE_DATA = ').strip().removesuffix(';'))
    bank=previous['puzzles'];feedback=previous['feedback']
    continents={c['id']:c['continent'] for c in countries}
    for p in bank:
        if p['countryId'] in continents: p['continent']=continents[p['countryId']]
        if any(name_gives_country(c,p['country']) for c in p['clues']):
            p['archived']=True;p['archiveReason']='A species name includes the answer country or its adjective.'
initial_count=len(bank);existing_ids=[p['id'] for p in bank];target_count=initial_count+args.add if args.add else None

def range_countries(tid):
    if tid in range_index:return range_index[tid]
    d=get(f'https://inaturalist-open-data.s3.us-east-1.amazonaws.com/geomodel/geojsons/latest/{tid}.geojson')
    if not d:
        range_index[tid] = None
        return None
    try:
        geo=d['geometry'] if d.get('type')=='Feature' else d['features'][0]['geometry']
        s=set_precision(make_valid(shape(geo)),.000001)
        present=set()
        for i in country_tree.query(s,predicate='intersects'):
            # Conservative: any non-trivial modeled land overlap counts, even a sliver.
            if area(s.intersection(geometries[i]))>.01:present.add(int(i))
        result={'countries':present,'version':d.get('properties',{}).get('geomodel_version')}
        range_index[tid]=result;return result
    except Exception as e:print('RANGE ERROR',tid,str(e),flush=True);return None

def combination_preference(supports):
    """Prefer wider ranges and sets that need more clues to identify a country."""
    widths = [len(countries) for countries in supports]
    required = next(
        (count for count in range(1, len(supports))
         if any(len(set.intersection(*subset)) == 1 for subset in itertools.combinations(supports, count))),
        len(supports),
    )
    return (widths.count(1), -required, -min(widths), -sum(widths))


def observation(taxon,base,ci):
    params=dict(base,taxon_id=taxon['id'],per_page=30,order_by='votes')
    animal=taxon.get('iconic_taxon_name') in ('Aves','Mammalia','Reptilia','Amphibia')
    if animal:params.update(term_id_or_unknown=17,without_term_value_id=19)
    data,url=api('observations',params)
    for o in (data or {}).get('results',[]):
        if o.get('license_code') not in ALLOWED or not o.get('location'):continue
        if o.get('geoprivacy') in ('private','obscured') or o.get('taxon_geoprivacy') in ('private','obscured'):continue
        if animal and any(a.get('controlled_attribute_id')==17 and a.get('controlled_value_id')==19 for a in o.get('annotations',[])):continue
        lat,lon=map(float,o['location'].split(','))
        # The query already filters the country before selecting. These checks
        # reject inconsistent place tags/boundaries, rather than sourcing globally.
        if base['place_id'] not in o.get('place_ids',[]):continue
        if not geometries[ci].covers(Point(lon,lat)):continue
        for photo in o.get('photos',[]):
            if photo.get('license_code') not in ALLOWED or photo.get('hidden') or photo.get('flags'):continue
            return {'id':o['id'],'url':o['uri'],'observer':o['user']['login'],'observerName':o['user'].get('name') or o['user']['login'],
                'location':[lon,lat],'date':o.get('observed_on'),'license':o['license_code'],'placeId':base['place_id'],'query':url,'deadExcluded':animal,
                'photo':{'id':photo['id'],'url':photo['url'].replace('/square.','/medium.'),'license':photo['license_code'],'attribution':photo['attribution'],
                    'source':f"https://www.inaturalist.org/photos/{photo['id']}"}}
    return None

def xyz(coords):
    a=np.radians(np.asarray(coords));x,y=a[:,0],a[:,1]
    return np.column_stack((np.cos(y)*np.cos(x),np.cos(y)*np.sin(x),np.sin(y)))

def border_samples(s):
    lines=[s.exterior] if s.geom_type=='Polygon' else [p.exterior for p in s.geoms if p.geom_type=='Polygon']
    points=[];neighbors=[]
    for line in lines:
        original=list(line.coords);dense=[]
        for a,b in zip(original,original[1:]):
            dense.append(a[:2]);distance=G.inv(a[0],a[1],b[0],b[1])[2]
            n=int(distance//15000)
            if n:dense.extend(G.npts(a[0],a[1],b[0],b[1],n))
        if len(dense)<3:continue
        for i,p in enumerate(dense):
            points.append(p);neighbors.append([dense[(i-1)%len(dense)],p,dense[(i+1)%len(dense)]])
    return np.array(points),neighbors

border_cache={}
def borders(ci):
    if ci not in border_cache:
        pts,segments=border_samples(geometries[ci]);border_cache[ci]=(pts,segments,cKDTree(xyz(pts)))
    return border_cache[ci]

def country_feedback(target):
    target_points,target_segments,target_tree=borders(target);out={}
    for i,c in enumerate(countries):
        if i==target:out[c['id']]={'km':0,'bearing':None,'touching':False};continue
        pts,segments,_=borders(i);dist,indices=target_tree.query(xyz(pts))
        j=int(np.argmin(dist));k=int(indices[j]);a=pts[j];b=target_points[k]
        bearing,_,distance=G.inv(a[0],a[1],b[0],b[1]);touching=geometries[i].intersects(geometries[target])
        if touching:
            # Adjacent countries: zero distance. Point toward their shared border
            # from the guessed country's interior rather than an undefined 0/0 bearing.
            a=geometries[i].representative_point();shared=geometries[i].boundary.intersection(geometries[target].boundary)
            if not shared.is_empty:b=nearest_points(a,shared)[1];bearing=G.inv(a.x,a.y,b.x,b.y)[0]
            distance=0
        else:
            # Refine the closest sampled border segments in a local equidistant
            # projection, then measure the returned points geodesically.
            midlon,midlat=G.npts(a[0],a[1],b[0],b[1],1)[0]
            try:
                forward=Transformer.from_crs('EPSG:4326',f'+proj=aeqd +lat_0={midlat} +lon_0={midlon} +datum=WGS84',always_xy=True)
                inverse=Transformer.from_crs(forward.target_crs,'EPSG:4326',always_xy=True)
                sa=transform(forward.transform,LineString(segments[j]));sb=transform(forward.transform,LineString(target_segments[k]))
                pa,pb=nearest_points(sa,sb);al,at=inverse.transform(pa.x,pa.y);bl,bt=inverse.transform(pb.x,pb.y)
                bearing,_,distance=G.inv(al,at,bl,bt)
            except Exception:pass
        out[c['id']]={'km':round(max(0,distance)/1000),'bearing':round(bearing%360,1)%360,'touching':bool(touching)}
    return out

def save():
    data={'version':1,'builtAt':'2026-11-19','countries':sorted(countries,key=lambda c:c['name']),
          'generation':{'existingIds':existing_ids,'addedCount':len(bank)-initial_count,'requestedAdditional':args.add},
          'puzzles':bank,'feedback':feedback,'method':{'type':'modeled-country-occurrence-intersection','rangeSource':'https://www.inaturalist.org/pages/range_maps',
          'boundarySource':'Natural Earth 1:10m','allowedLicenses':sorted(ALLOWED),'countryFirst':True,'minimumModeledLandOverlapKm2':.01,
          'countryNameRules':NAME_RULES,'deadAnnotationFilter':{'term_id_or_unknown':17,'without_term_value_id':19},'note':'Unique in the modeled country index; not proof of biological absence. Border distances are approximate nearest-border distances.'}}
    (OUT/'data.js').write_text('window.NATURE_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
    (WORK/'bank.json').write_text(json.dumps(data,ensure_ascii=False));(WORK/'diagnostics.json').write_text(json.dumps(diagnostics))

for ci in country_order:
    if target_count is not None and len(bank)>=target_count:break
    country = countries[ci]
    name = country['name']
    print('COUNTRY',name,flush=True)
    place = country_place(ci)
    if not place:diagnostics.append({'country':name,'error':'No unambiguous country place'});save();continue
    # COUNTRY FIRST: this base is shared by every candidate and photo query.
    base={'place_id':place['id'],'quality_grade':'research','photos':'true','captive':'false','photo_license':'cc0,cc-by','license':'cc0,cc-by','geoprivacy':'open','taxon_geoprivacy':'open','acc_below':100,'hrank':'species'}
    pools=[];queries=[]
    for category,iconic in GROUPS:
        d,url=api('observations/species_counts',dict(base,iconic_taxa=iconic,per_page=100));queries.append(url)
        eligible=[x for x in (d or {}).get('results',[]) if x['count']>=3 and x['taxon']['rank']=='species' and x['taxon'].get('observations_count',0)>=100 and not name_gives_country(x['taxon'],name)]
        ranked = sorted(eligible, key=lambda x: x['taxon'].get('observations_count', 0), reverse=True)
        # Observation counts only bound the model lookups. Actual range sizes rank the pool.
        shortlist = ranked[:20] + ranked[-4:]
        candidates = {}
        for x in shortlist:
            t = x['taxon']
            tid = t['id']
            if tid in candidates:
                continue
            model = range_countries(tid)
            if model and ci in model['countries']:
                candidates[tid] = {'category':category,'taxon':t,'localCount':x['count'],'range':model}
        by_width = sorted(candidates.values(), key=lambda x: (len(x['range']['countries']), x['localCount']), reverse=True)
        # Leave two narrower alternatives in the search for sparsely covered countries.
        pool = by_width[:6] + by_width[6:][-2:]
        pools.append(pool);print(' ',category,len(pool),'modeled candidates',flush=True)
        if not pool:
            diagnostics.append({'country':name,'error':'Missing category/range coverage','category':category,'pools':[len(p) for p in pools]})
            break
    if len(pools) != len(GROUPS) or not pools[-1]:
        save()
        continue
    combos=[]
    for combo in itertools.product(*pools):
        supports = [clue['range']['countries'] for clue in combo]
        if set.intersection(*supports)=={ci}:
            score = (*combination_preference(supports), -sum(math.log1p(x['localCount']) for x in combo))
            combos.append((score,combo))
    combos.sort(key=lambda c:c[0]);used=[tuple(c['taxonId'] for c in p['clues']) for p in bank if p['countryId']==country['id']];made=0;obs_cache={}
    pool_ids = [set(x['taxon']['id'] for x in pool) for pool in pools]
    unavailable = set()
    for _,combo in combos:
        ids=tuple(x['taxon']['id'] for x in combo)
        if unavailable.intersection(ids):continue
        if any(sum(a!=b for a,b in zip(ids,old))<2 for old in used):continue
        clues=[]
        for x in combo:
            tid=x['taxon']['id']
            if tid not in obs_cache:obs_cache[tid]=observation(x['taxon'],base,ci)
            o=obs_cache[tid]
            if not o:
                unavailable.add(tid)
                break
            r=x['range'];t=x['taxon']
            clues.append({'category':x['category'],'taxonId':tid,'name':t.get('preferred_common_name',t['name']),'scientific':t['name'],
                'localCount':x['localCount'],'supportedCountries':sorted(countries[i]['id'] for i in r['countries']),
                'rangeUrl':f'https://inaturalist-open-data.s3.us-east-1.amazonaws.com/geomodel/geojsons/latest/{tid}.geojson','modelVersion':r['version'],'observation':o})
        if len(clues)<5:
            if any(ids <= unavailable for ids in pool_ids):
                break
            continue
        puzzle={'id':country['id'].lower()+'-'+hashlib.sha256(','.join(map(str,ids)).encode()).hexdigest()[:8],
            'countryId':country['id'],'country':name,'continent':country['continent'],'placeId':place['id'],'clues':clues,'matchingCountries':[country['id']],
            'selectionQueries':queries,'uniqueness':'unique-in-modeled-country-index'}
        bank.append(puzzle);used.append(ids);made+=1
        if country['id'] not in feedback:feedback[country['id']]=country_feedback(ci)
        save();print(' ACCEPTED',puzzle['id'],flush=True)
        if made>=args.per_country or (target_count is not None and len(bank)>=target_count):break
    diagnostics.append({'country':name,'accepted':made,'error':None if made else 'No suitable set','uniqueCombinations':len(combos),'pools':[len(p) for p in pools]});save()
print('DONE',len(bank),'puzzles;',len(bank)-initial_count,'added',flush=True)
if target_count is not None and len(bank)<target_count:raise SystemExit(f'Only {len(bank)-initial_count} new eligible puzzles found; requested {args.add}.')
