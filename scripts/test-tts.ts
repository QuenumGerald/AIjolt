#!/usr/bin/env node
import 'dotenv/config';
import { config } from '../src/config.js';
import { createGmiClient } from '../src/gmi/client.js';

async function testTTS(text: string, voiceId: string, apiKey: string, outputPath: string) {
  const client = createGmiClient({ dryRun: false, fetchImpl: fetch });
  config.gmi.apiKey = apiKey;

  console.log(`Génération TTS avec la voix ${voiceId}...`);
  console.log(`Texte: "${text}"`);

  const payload = {
    text,
    voice_id: voiceId,
    model: config.gmi.ttsModel,
    language_boost: config.gmi.languageBoost,
  };

  const request = await client.submit(config.gmi.ttsModel, payload);
  console.log(`Request ID: ${request.request_id}`);
  console.log(`Status: ${request.status}`);

  console.log('Attente de la génération...');
  const result = await client.wait(request.request_id);
  console.log(`Status final: ${result.status}`);

  if (result.status === 'success') {
    const audioUrl = result.outcome?.audio_url || result.outcome?.url;
    if (!audioUrl) {
      throw new Error('Pas d\'URL audio dans la réponse');
    }

    console.log(`Download de l'audio...`);
    await client.download(audioUrl, outputPath);
    console.log(`\n✅ Fichier audio généré: ${outputPath}`);
  } else {
    console.log(`\n❌ Échec de la génération TTS: ${JSON.stringify(result.error)}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length < 4) {
  console.log('Usage: node scripts/test-tts.ts <texte> <voice_id> <api_key> <output_path>');
  console.log('');
  console.log('Exemple:');
  console.log('  node scripts/test-tts.ts "Bonjour, ceci est un test." "ma_voix_20s" "YOUR_API_KEY" "./test.mp3"');
  process.exit(1);
}

const text = args[0];
const voiceId = args[1];
const apiKey = args[2];
const outputPath = args[3];

testTTS(text, voiceId, apiKey, outputPath).catch(err => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
