import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';

export function localSql(sql) {
 const project=process.env.TRAILUP_TEST_COMPOSE_PROJECT??'';
 const envFile=process.env.TRAILUP_TEST_ENV_FILE??'';
 if(!/^trailup-issue1-[a-f0-9]{10}$/.test(project)||basename(envFile)!=='env'||!envFile.includes('trailup-cadastro-integrado-'))throw Error('Use o runner de teste local.');
 return execFileSync('docker',['compose','--env-file',envFile,'-f',fileURLToPath(new URL('./compose.yml',import.meta.url)),'-p',project,'exec','-T','db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8'}).trim();
}
