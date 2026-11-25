import json, sys
from faster_whisper import WhisperModel
model=WhisperModel('tiny',device='cpu',compute_type='int8',cpu_threads=1,num_workers=1)
segments,_=model.transcribe(sys.argv[1],vad_filter=True,beam_size=1)
print(json.dumps([{'start':s.start,'end':s.end,'text':s.text.strip()} for s in segments],ensure_ascii=False))
