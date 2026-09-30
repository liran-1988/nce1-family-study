from pathlib import Path
import csv,json
root=Path(__file__).parent/'delivery-android'
sources=json.loads((root/'verified-course-map.json').read_text(encoding='utf8'))
media=json.loads((root/'media'/'media-manifest.json').read_text(encoding='utf8'))
lessons=media.get('lessons',{})
if isinstance(lessons,list):lessons={str(x.get('lessonId',x.get('lesson'))):x for x in lessons}
rows=[]
for r in sources['lessons']:
 n=r['lesson'];m=lessons.get(str(n),{})
 vids=m.get('videos',[]);refs=r['sourceRefs']
 rows.append({'课号':n,'教材文件':'内置 books/student.pdf','PDF物理页':r['studentPdfPage'],'教材印刷页':r['studentPrintedPage'],'正文核对':r['status'],'实际视频文件':' | '.join(str(x.get('path',x.get('outputPath',''))) for x in vids),'视频核对':' | '.join(str(x.get('mappingStatus',x.get('sourceVerified','candidate'))) for x in vids),'视频片段名':' | '.join(x.get('title','') for x in vids),'工作簿候选PDF页':' | '.join(str(x['pdfPage']) for x in refs if x['source']=='workbook'),'答案候选PDF页':' | '.join(str(x['pdfPage']) for x in refs if x['source']=='answers'),'教师书候选PDF页':' | '.join(str(x['pdfPage']) for x in refs if x['source']=='teacher'),'配套题答案核查':'课首标签候选，非全量逐题核验','未核范围':' | '.join(r.get('notVerified',[]))})
with (root/'教材视频练习答案对应清单.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows(rows)
(root/'教材视频练习答案对应清单.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print('已写144课实际对应表；视频以当前实际产物清单为准，不预填未生成文件。')
