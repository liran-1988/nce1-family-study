from pathlib import Path
import zipfile,json,hashlib,sys,re
ROOT=Path(__file__).parent
D=ROOT/'delivery-android'
fail=[];checks=[]
def check(name,value,detail=''):
 checks.append({'name':name,'status':'pass' if value else 'fail','detail':detail})
 if not value:fail.append(name)
apk=D/'nce1-family-offline.apk'
check('实际APK存在',apk.exists())
if apk.exists():
 with zipfile.ZipFile(apk) as z:
  names=z.namelist()
  check('APK已签名所需DEX/manifest存在','classes.dex'in names and 'AndroidManifest.xml'in names)
  payload=z.read('assets/index.html')
  check('APK内页面等于最终index',hashlib.sha256(payload).hexdigest()==hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest())
  check('APK无MP4文件',not any(n.lower().endswith('.mp4') for n in names))
  check('APK内置三份教材PDF',all('assets/books/'+x+'.pdf' in names for x in ['student','workbook','teacher']))
  mp=json.loads(z.read('assets/media-map.json'))
  check('APK144课视频映射齐全',len(mp['videos'])==144)
  paths=[]
  for v in mp['videos'].values():
   if isinstance(v,list): paths.extend(x['path'] for x in v)
   else: paths.append(v)
  check('APK映射216视频且全部非MP4',len(paths)==216 and len(set(paths))==216 and all(x.endswith('.mkv') for x in paths))
  check('所有映射资源文件存在',all((D/'media'/x).is_file() for x in paths))
  check('PDF课程映射L19/143正确',mp['pdf']['pages'].get('19')==41 and mp['pdf']['pages'].get('143')==293)
  check('APK无外部D盘媒体访问默认值',b'const VIDEO_DIR=' not in payload and b'file:///D:' not in payload)
  for b in ['student','workbook','teacher']:
   check('APK '+b+' PDF可打开(签名页数另有原生验收)',len(z.read('assets/books/'+b+'.pdf'))>100000)
media=json.loads((D/'media/media-manifest.json').read_text(encoding='utf8'))
finals=media.get('finalArtifacts',[])
if isinstance(finals,dict):finals=list(finals.values())
check('实际MKV正式资源216文件',len(list((D/'media/videos').glob('*.mkv')))==216)
check('媒体清单完成而非partial','partial'not in media['status'] and 'failed'not in media['status'])
check('未混入MP4作最终媒体',not any(p.suffix.lower()=='.mp4' for p in (D/'media/videos').glob('*')))
for p in (D/'media/videos').glob('*.mkv'):
 with p.open('rb') as f:head=f.read(4096)
 check('真实Matroska '+p.name,head.startswith(bytes.fromhex('1a45dfa3')) and b'matroska'in head)
# Final physical file count is a delivery completeness gate, not textbook/editorial accuracy evidence.
result={'status':'pass'if not fail else 'fail','scope':'artifact assets and relative resource availability; does not certify all textbook content or all Android devices','apkBytes':apk.stat().st_size if apk.exists() else 0,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest()if apk.exists()else None,'mediaBytes':sum(p.stat().st_size for p in (D/'media/videos').glob('*.mkv')),'checks':checks,'failures':fail}
(D/'delivery-artifact-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items()if k!='checks'},ensure_ascii=False,indent=2))
sys.exit(0 if not fail else 1)
