import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ElevenLabs API configuration
const ELEVENLABS_API_KEY = '57a9ca943d59213e3312e0e0dfd14c6a183baf3bda3293c70852c8a32fb23e20';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

if (!ELEVENLABS_API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY environment variable is required');
  process.exit(1);
}

async function fetchAllVoices() {
  try {
    console.log('🎤 Fetching all voices from ElevenLabs...');
    
    const response = await axios.get(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const voices = response.data.voices || [];
    console.log(`✅ Found ${voices.length} voices`);

    // Categorize voices
    const categorizedVoices = categorizeVoices(voices);
    
    // Save to file
    const outputPath = path.join(__dirname, '../src/config/voiceMap.js');
    const voiceMapContent = generateVoiceMapContent(categorizedVoices);
    
    fs.writeFileSync(outputPath, voiceMapContent);
    console.log(`✅ Voice map saved to ${outputPath}`);
    
    // Print summary
    printSummary(categorizedVoices);
    
  } catch (error) {
    console.error('❌ Error fetching voices:', error.response?.data || error.message);
    process.exit(1);
  }
}

function categorizeVoices(voices) {
  const categories = {
    narration: [],
    male: [],
    female: [],
    villain: [],
    monster: []
  };

  voices.forEach(voice => {
    const name = voice.name?.toLowerCase() || '';
    const description = voice.labels?.description?.toLowerCase() || '';
    const category = voice.labels?.category?.toLowerCase() || '';
    const age = voice.labels?.age?.toLowerCase() || '';
    const gender = voice.labels?.gender?.toLowerCase() || '';
    const accent = voice.labels?.accent?.toLowerCase() || '';
    const use_case = voice.labels?.use_case?.toLowerCase() || '';
    
    // Enhanced voice object
    const enhancedVoice = {
      id: voice.voice_id,
      name: voice.name,
      description: voice.labels?.description || '',
      category: voice.labels?.category || '',
      age: voice.labels?.age || '',
      gender: voice.labels?.gender || '',
      accent: voice.labels?.accent || '',
      use_case: voice.labels?.use_case || '',
      // Additional metadata
      preview_url: voice.preview_url,
      available_for_tiers: voice.available_for_tiers || [],
      settings: voice.settings || {}
    };

    // Categorization logic
    if (isNarrationVoice(name, description, category, use_case)) {
      categories.narration.push(enhancedVoice);
    } else if (isVillainVoice(name, description, category)) {
      categories.villain.push(enhancedVoice);
    } else if (isMonsterVoice(name, description, category)) {
      categories.monster.push(enhancedVoice);
    } else if (isMaleVoice(name, description, gender)) {
      categories.male.push(enhancedVoice);
    } else if (isFemaleVoice(name, description, gender)) {
      categories.female.push(enhancedVoice);
    }
  });

  // Sort each category by age
  Object.keys(categories).forEach(category => {
    categories[category] = sortVoicesByAge(categories[category]);
  });

  return categories;
}

function isNarrationVoice(name, description, category, use_case) {
  const narrationKeywords = [
    'narrator', 'narrative', 'storyteller', 'announcer', 'host',
    'neutral', 'professional', 'clear', 'warm', 'calm'
  ];
  
  return narrationKeywords.some(keyword => 
    name.includes(keyword) || 
    description.includes(keyword) || 
    category.includes(keyword) ||
    use_case.includes(keyword)
  );
}

function isVillainVoice(name, description, category) {
  const villainKeywords = [
    'villain', 'evil', 'dark', 'sinister', 'menacing', 'threatening',
    'antagonist', 'bad', 'wicked', 'malicious', 'cruel'
  ];
  
  return villainKeywords.some(keyword => 
    name.includes(keyword) || 
    description.includes(keyword) || 
    category.includes(keyword)
  );
}

function isMonsterVoice(name, description, category) {
  const monsterKeywords = [
    'monster', 'creature', 'beast', 'demon', 'ghost', 'zombie',
    'alien', 'robot', 'mechanical', 'synthetic', 'artificial'
  ];
  
  return monsterKeywords.some(keyword => 
    name.includes(keyword) || 
    description.includes(keyword) || 
    category.includes(keyword)
  );
}

function isMaleVoice(name, description, gender) {
  return gender === 'male' || 
         name.includes('male') || 
         description.includes('male') ||
         description.includes('man') ||
         description.includes('boy');
}

function isFemaleVoice(name, description, gender) {
  return gender === 'female' || 
         name.includes('female') || 
         description.includes('female') ||
         description.includes('woman') ||
         description.includes('girl');
}

function sortVoicesByAge(voices) {
  const ageOrder = {
    'young': 1,
    'teen': 2,
    'young adult': 3,
    'adult': 4,
    'middle-aged': 5,
    'elderly': 6,
    'old': 6
  };

  return voices.sort((a, b) => {
    const ageA = ageOrder[a.age] || 4; // Default to adult
    const ageB = ageOrder[b.age] || 4;
    return ageA - ageB;
  });
}

function generateVoiceMapContent(categorizedVoices) {
  return `// Auto-generated voice mapping from ElevenLabs API
// Generated on: ${new Date().toISOString()}

export const voiceMap = {
  // Narration voices (neutral, professional storytellers)
  narration: {
    young: ${JSON.stringify(categorizedVoices.narration.filter(v => v.age === 'young'), null, 4)},
    teen: ${JSON.stringify(categorizedVoices.narration.filter(v => v.age === 'teen'), null, 4)},
    adult: ${JSON.stringify(categorizedVoices.narration.filter(v => v.age === 'adult' || v.age === 'young adult'), null, 4)},
    elderly: ${JSON.stringify(categorizedVoices.narration.filter(v => v.age === 'elderly' || v.age === 'old'), null, 4)},
    all: ${JSON.stringify(categorizedVoices.narration, null, 4)}
  },

  // Male character voices
  male: {
    young: ${JSON.stringify(categorizedVoices.male.filter(v => v.age === 'young'), null, 4)},
    teen: ${JSON.stringify(categorizedVoices.male.filter(v => v.age === 'teen'), null, 4)},
    adult: ${JSON.stringify(categorizedVoices.male.filter(v => v.age === 'adult' || v.age === 'young adult'), null, 4)},
    elderly: ${JSON.stringify(categorizedVoices.male.filter(v => v.age === 'elderly' || v.age === 'old'), null, 4)},
    all: ${JSON.stringify(categorizedVoices.male, null, 4)}
  },

  // Female character voices
  female: {
    young: ${JSON.stringify(categorizedVoices.female.filter(v => v.age === 'young'), null, 4)},
    teen: ${JSON.stringify(categorizedVoices.female.filter(v => v.age === 'teen'), null, 4)},
    adult: ${JSON.stringify(categorizedVoices.female.filter(v => v.age === 'adult' || v.age === 'young adult'), null, 4)},
    elderly: ${JSON.stringify(categorizedVoices.female.filter(v => v.age === 'elderly' || v.age === 'old'), null, 4)},
    all: ${JSON.stringify(categorizedVoices.female, null, 4)}
  },

  // Villain voices (human antagonists)
  villain: {
    young: ${JSON.stringify(categorizedVoices.villain.filter(v => v.age === 'young'), null, 4)},
    teen: ${JSON.stringify(categorizedVoices.villain.filter(v => v.age === 'teen'), null, 4)},
    adult: ${JSON.stringify(categorizedVoices.villain.filter(v => v.age === 'adult' || v.age === 'young adult'), null, 4)},
    elderly: ${JSON.stringify(categorizedVoices.villain.filter(v => v.age === 'elderly' || v.age === 'old'), null, 4)},
    all: ${JSON.stringify(categorizedVoices.villain, null, 4)}
  },

  // Monster voices (non-human creatures)
  monster: {
    young: ${JSON.stringify(categorizedVoices.monster.filter(v => v.age === 'young'), null, 4)},
    teen: ${JSON.stringify(categorizedVoices.monster.filter(v => v.age === 'teen'), null, 4)},
    adult: ${JSON.stringify(categorizedVoices.monster.filter(v => v.age === 'adult' || v.age === 'young adult'), null, 4)},
    elderly: ${JSON.stringify(categorizedVoices.monster.filter(v => v.age === 'elderly' || v.age === 'old'), null, 4)},
    all: ${JSON.stringify(categorizedVoices.monster, null, 4)}
  }
};

// Helper functions for voice selection
export const getVoiceByCategoryAndAge = (category, age) => {
  const voices = voiceMap[category]?.[age] || voiceMap[category]?.all || [];
  return voices.length > 0 ? voices[Math.floor(Math.random() * voices.length)] : null;
};

export const getRandomVoice = (category) => {
  const voices = voiceMap[category]?.all || [];
  return voices.length > 0 ? voices[Math.floor(Math.random() * voices.length)] : null;
};

export const getVoiceById = (voiceId) => {
  for (const category in voiceMap) {
    for (const ageGroup in voiceMap[category]) {
      const voice = voiceMap[category][ageGroup].find(v => v.id === voiceId);
      if (voice) return voice;
    }
  }
  return null;
};

// Voice statistics
export const getVoiceStats = () => {
  const stats = {};
  for (const category in voiceMap) {
    stats[category] = {
      total: voiceMap[category].all.length,
      byAge: {}
    };
    for (const ageGroup in voiceMap[category]) {
      if (ageGroup !== 'all') {
        stats[category].byAge[ageGroup] = voiceMap[category][ageGroup].length;
      }
    }
  }
  return stats;
};
`;
}

function printSummary(categorizedVoices) {
  console.log('\n📊 Voice Categories Summary:');
  console.log('================================');
  
  Object.keys(categorizedVoices).forEach(category => {
    const total = categorizedVoices[category].length;
    console.log(`\n${category.toUpperCase()}: ${total} voices`);
    
    const ageGroups = {};
    categorizedVoices[category].forEach(voice => {
      const age = voice.age || 'unknown';
      ageGroups[age] = (ageGroups[age] || 0) + 1;
    });
    
    Object.keys(ageGroups).forEach(age => {
      console.log(`  - ${age}: ${ageGroups[age]} voices`);
    });
  });
  
  console.log('\n✅ Voice mapping completed!');
}

// Run the script
fetchAllVoices();