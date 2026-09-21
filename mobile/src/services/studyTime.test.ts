import assert from 'node:assert/strict';
import test from 'node:test';
import { saveStudyTime } from './studyTime';

const params={ alunoId:'student',topicoId:131,conteudoId:192,atividadeId:null,minutes:1 };
test('retentativa de tempo conserva o identificador de idempotência',async()=>{
  const calls:any[]=[];
  const client={ async rpc(name:string,payload:any) {
    assert.equal(name,'trailup_registrar_intervalo_estudo'); calls.push(payload);
    return {error:calls.length===1?{message:'Network request failed'}:null};
  } };
  await saveStudyTime(client as any,params);
  assert.equal(calls.length,2);
  assert.equal(calls[0].p_intervalo,calls[1].p_intervalo);
  assert.equal(calls[0].p_tempo_min,1);
});
test('RLS não é ignorada ou retentada como problema de rede',async()=>{
  let calls=0;
  const client={ async rpc(){ calls++; return {error:{code:'42501'}}; } };
  await assert.rejects(saveStudyTime(client as any,params));
  assert.equal(calls,1);
});
