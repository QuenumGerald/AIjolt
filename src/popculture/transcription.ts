import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const exec=promisify(execFile);
export type SpeechSegment={start:number;end:number;text:string};
export async function transcribe(url:string):Promise<SpeechSegment[]>{const dir=await mkdtemp(join(tmpdir(),'klieg-speech-'));try{const wav=join(dir,'audio.wav');await exec('ffmpeg',['-nostdin','-v','error','-rw_timeout','25000000','-i',url,'-t','360','-vn','-ac','1','-ar','16000',wav],{timeout:60000});const r=await exec(process.env.POPCULTURE_WHISPER_PYTHON||'.venv-whisper/bin/python',['scripts/klieg-transcribe.py',wav],{timeout:180000,maxBuffer:1000000});return JSON.parse(r.stdout) as SpeechSegment[];}finally{await rm(dir,{recursive:true,force:true});}}
