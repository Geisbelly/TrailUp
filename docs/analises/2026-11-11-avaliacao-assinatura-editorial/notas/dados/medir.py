import json,sys,re,unicodedata,glob,os
S=sys.argv[1]; suf=sys.argv[2]  # 'gemini'
ass=json.load(open(S+'/assinaturas.json',encoding='utf-8'))
blocos=json.load(open(S+'/blocos.json',encoding='utf-8'))
chave={'seeker':'Seeker','survivor':'Survivor','mastermind':'Mastermind'}
def norm(t): return unicodedata.normalize('NFKD',t.lower()).encode('ascii','ignore').decode()
todos={k:[norm(m) for m in v['marcadores_linguisticos']] for k,v in ass.items()}
fatos={'lista precisa estar ordenada':r'ordenad','n comparações (linear)':r'\bn`? comparac|1[\.\s]?000[\.\s]?000 de comparac','meio = (inicio + fim) // 2':r'\(inicio \+ fim\) // 2','meio + 1 / meio - 1':r'meio \+ 1','~20 passos':r'\b20 (passos|comparac)','while inicio <= fim':r'inicio <= fim','retorna -1':r'-1','erro inicio < fim':r'inicio < fim','erro inicio = meio':r'inicio = meio\b(?! \+)','11 para 1.024':r'\b11 comparac|\b11 passos','O(log n)':r'o\(log n\)','O(n log n)':r'n log n','lista exemplo':r'3, 8, 15, 21, 37, 42, 56','dicionário':r'dicionari'}
med={};fal={};cont={}
for p in chave:
  for c in ['atual','assinatura']:
    f=f'{S}/gen/{p}-{c}.{suf}.json'
    if not os.path.exists(f): continue
    d=json.load(open(f,encoding='utf-8')); so=d['conteudo']; cont[f'{p}-{c}']=so
    caps=so['chapters']; txt=' '.join(ch['markdown'] for ch in caps); aud=' '.join(ch['audioScript'] for ch in caps)
    n=norm(txt+' '+aud); words=len(re.findall(r'\w+',n))
    conta=lambda ms: sum(len(re.findall(r'\b'+re.escape(m),n)) for m in ms)
    own=conta(todos[chave[p]]); outros=[conta(v) for k,v in todos.items() if k!=chave[p]]
    md=norm(txt)
    fal[f'{p}-{c}']=[k for k,r in fatos.items() if not re.search(r,md)]
    med[f'{p}-{c}']=dict(capitulos=len(caps),palavras_md=len(re.findall(r'\w+',txt)),palavras_audio=len(re.findall(r'\w+',aud)),marc_proprio_mil=round(own*1000/words,2),marc_outros_mil=round(sum(outros)/len(outros)*1000/words,2),saida=d['uso'].get('candidatesTokenCount'),pensamento=d['uso'].get('thoughtsTokenCount'),segundos=d['segundos'])
    print(f'{p}-{c}',med[f'{p}-{c}'],'fatos',14-len(fal[f'{p}-{c}']),'/14',fal[f'{p}-{c}'])
json.dump(med,open(f'{S}/gen/medidas.{suf}.json','w'),ensure_ascii=False); json.dump(fal,open(f'{S}/gen/fatos.{suf}.json','w'),ensure_ascii=False); json.dump(cont,open(f'{S}/gen/conteudos.{suf}.json','w'),ensure_ascii=False)
