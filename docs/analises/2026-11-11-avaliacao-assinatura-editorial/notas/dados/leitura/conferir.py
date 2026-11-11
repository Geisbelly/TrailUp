import math
L=[3,8,15,21,37,42,56]
def bb(l,a,cond_le=True,mais_um=True,lim=50):
    i,f=0,len(l)-1;passos=0;rastro=[]
    while (i<=f if cond_le else i<f):
        passos+=1
        if passos>lim: return 'LOOP',rastro[:6]
        m=(i+f)//2; rastro.append((i,f,m,l[m]))
        if l[m]==a: return m,rastro
        if l[m]<a: i=m+1 if mais_um else m
        else: f=m-1 if mais_um else m
    return -1,rastro
print('correto 37:',bb(L,37))
print('com < : alvos nao achados =',[x for x in L if bb(L,x,cond_le=False)[0]==-1])
print('inicio=meio: alvos em loop =',[x for x in L+[60] if bb(L,x,mais_um=False)[0]=='LOOP'])
desc=sorted(L,reverse=True); print('lista decrescente, achar 37:',bb(desc,37)[0], 'achar 8:',bb(desc,8)[0])
dup=[3,8,8,8,15]; print('com repetidos (nao estrita), achar 8:',bb(dup,8)[0])
for n in (1024,2048,10**6): print(n,'max comparacoes', math.floor(math.log2(n))+1, 'log2=',round(math.log2(n),2))
print('max passos busca em L (n=7):',max(len(bb(L,x)[1]) for x in L+[0,60]))
