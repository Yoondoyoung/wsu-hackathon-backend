import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load voices data
const voicesPath = path.join(__dirname, '..', 'data', 'voices.json');
const voicesData = JSON.parse(fs.readFileSync(voicesPath, 'utf8'));

function generateVoicePrompt() {
  const { narrator, characters, all } = voicesData;
  
  // Create categorized voice lists for the prompt
  const narratorVoices = narrator.map(voice => ({
    id: voice.voice_id,
    name: voice.name,
    description: voice.description || 'No description',
    labels: voice.labels || {},
    category: voice.category
  }));

  const characterVoices = characters.map(voice => ({
    id: voice.voice_id,
    name: voice.name,
    description: voice.description || 'No description',
    labels: voice.labels || {},
    category: voice.category
  }));

  // Create a comprehensive voice list
  const allVoices = all.map(voice => ({
    id: voice.voice_id,
    name: voice.name,
    description: voice.description || 'No description',
    labels: voice.labels || {},
    category: voice.category
  }));

  // Generate voice prompt section
  const voicePrompt = `
## AVAILABLE VOICES

You have access to the following ElevenLabs voices. Use the exact voice_id when creating narration and character voices.

### NARRATOR VOICES (Recommended for narration)
${narratorVoices.map(voice => 
  `- **${voice.name}** (voice_id: "${voice.id}")
  - Description: ${voice.description}
  - Category: ${voice.category}
  - Labels: ${Object.entries(voice.labels).map(([key, value]) => `${key}: ${value}`).join(', ')}`
).join('\n')}

### CHARACTER VOICES (Recommended for character dialogue)
${characterVoices.map(voice => 
  `- **${voice.name}** (voice_id: "${voice.id}")
  - Description: ${voice.description}
  - Category: ${voice.category}
  - Labels: ${Object.entries(voice.labels).map(([key, value]) => `${key}: ${value}`).join(', ')}`
).join('\n')}

### ALL AVAILABLE VOICES
${allVoices.map(voice => 
  `- **${voice.name}** (voice_id: "${voice.id}") - ${voice.description}`
).join('\n')}

## VOICE SELECTION GUIDELINES

1. **Narration**: Use narrator voices for consistent storytelling. Recommended: James, Sarah, Laura, or other professional voices.
2. **Characters**: Choose character voices that match personality, age, and gender. Use the labels to find appropriate voices.
3. **Consistency**: Use the same voice_id for the same character across all scenes.
4. **Voice ID Format**: Always use the exact voice_id string (e.g., "EkK5I93UQWFDigLMpZcX") in your JSON response.

## EXAMPLE VOICE ASSIGNMENTS

For a typical story:
- **Narrator**: Use "EkK5I93UQWFDigLMpZcX" (James - Husky & Engaging) for warm, professional narration
- **Hero**: Use "ZF6FPAbjXT4488VcRRnw" (Amelia) for a young female protagonist
- **Sidekick**: Use "Crm8VULvkVs5ZBDa1Ixm" (Andrea Wolff) for a clear, youthful companion
- **Villain**: Use "2EiwWnXFnvU5JabPnv8n" (Clyde) for a deep, intimidating antagonist

Remember: The voice_id must match exactly from the list above.`;

  return voicePrompt;
}

// Generate and save the voice prompt
const voicePrompt = generateVoicePrompt();
const outputPath = path.join(__dirname, '..', 'data', 'voicePrompt.txt');

fs.writeFileSync(outputPath, voicePrompt);
console.log(`✅ Generated voice prompt and saved to ${outputPath}`);

// Also create a JSON version for easy integration
const voicePromptJson = {
  narrator_voices: voicesData.narrator.map(voice => ({
    voice_id: voice.voice_id,
    name: voice.name,
    description: voice.description || 'No description',
    labels: voice.labels || {},
    category: voice.category
  })),
  character_voices: voicesData.characters.map(voice => ({
    voice_id: voice.voice_id,
    name: voice.name,
    description: voice.description || 'No description',
    labels: voice.labels || {},
    category: voice.category
  })),
  all_voices: voicesData.all.map(voice => ({
    voice_id: voice.voice_id,
    name: voice.name,
    description: voice.description || 'No description',
    labels: voice.labels || {},
    category: voice.category
  }))
};

const jsonOutputPath = path.join(__dirname, '..', 'data', 'voicePrompt.json');
fs.writeFileSync(jsonOutputPath, JSON.stringify(voicePromptJson, null, 2));
console.log(`✅ Generated voice prompt JSON and saved to ${jsonOutputPath}`);

console.log(`\n📊 Voice Summary:`);
console.log(`- Narrator voices: ${voicesData.narrator.length}`);
console.log(`- Character voices: ${voicesData.characters.length}`);
console.log(`- Total voices: ${voicesData.all.length}`);
