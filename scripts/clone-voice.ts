#!/usr/bin/env node
import 'dotenv/config';
import { config } from '../src/config.js';
import { createGmiClient } from '../src/gmi/client.js';

async function cloneVoice(sourceAudioPath: string, voiceId: string, apiKey: string, options: {
  promptAudioPath?: string;
  promptText?: string;
  needNoiseReduction?: boolean;
  needVolumeNormalization?: boolean;
} = {}) {
  const client = createGmiClient({ dryRun: false, fetchImpl: fetch });
  // Override pour utiliser l'API key fournie
  config.gmi.apiKey = apiKey;

  console.log('Upload du fichier source audio...');
  const sourceUpload = await client.upload(sourceAudioPath, 'mp3');
  console.log(`Source uploadé: ${sourceUpload.publicUrl}`);

  const payload: Record<string, unknown> = {
    text: "Hello! This is my cloned voice speaking.",
    source_audio: sourceUpload.publicUrl,
    voice_id: voiceId,
    need_noise_reduction: options.needNoiseReduction ?? true,
    need_volumn_normalization: options.needVolumeNormalization ?? true,
  };

  if (options.promptAudioPath && options.promptText) {
    console.log('Upload du fichier prompt audio...');
    const promptUpload = await client.upload(options.promptAudioPath, 'mp3');
    console.log(`Prompt uploadé: ${promptUpload.publicUrl}`);
    payload.prompt_audio = promptUpload.publicUrl;
    payload.prompt_text = options.promptText;
  }

  console.log('Soumission du clonage de voix...');
  const request = await client.submit('minimax-audio-voice-clone-speech-2.8-hd', payload);
  console.log(`Request ID: ${request.request_id}`);
  console.log(`Status: ${request.status}`);

  console.log('Attente du traitement...');
  const result = await client.wait(request.request_id);
  console.log(`Status final: ${result.status}`);

  if (result.status === 'success') {
    console.log(`\n✅ Voix clonée avec succès!`);
    console.log(`Voice ID: ${voiceId}`);
    console.log(`\nAjoutez ceci à votre .env:`);
    console.log(`GMI_TTS_VOICE_ID=${voiceId}`);
  } else {
    console.log(`\n❌ Échec du clonage: ${JSON.stringify(result.error)}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node scripts/clone-voice.ts <source_audio_path> <voice_id> <api_key> [prompt_audio_path] [prompt_text]');
  console.log('');
  console.log('Exemple:');
  console.log('  node scripts/clone-voice.ts "./source.mp3" "ma_voix_001" "YOUR_API_KEY"');
  console.log('  node scripts/clone-voice.ts "./source.mp3" "ma_voix_001" "YOUR_API_KEY" "./prompt.mp3" "Texte du prompt audio."');
  process.exit(1);
}

const sourceAudioPath = args[0];
const voiceId = args[1];
const apiKey = args[2];
const promptAudioPath = args[3];
const promptText = args[4];

cloneVoice(sourceAudioPath, voiceId, apiKey, {
  promptAudioPath,
  promptText,
}).catch(err => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
