import json, sys, wave
import numpy as np
from faster_whisper import WhisperModel
model=WhisperModel('tiny',device='cpu',compute_type='int8',cpu_threads=1,num_workers=1)
with wave.open(sys.argv[1],'rb') as w:
    audio=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
segments,_=model.transcribe(audio,vad_filter=True,beam_size=1)
print(json.dumps([{'start':s.start,'end':s.end,'text':s.text.strip()} for s in segments],ensure_ascii=False))
