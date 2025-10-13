import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { HttpError } from "../utils/errorHandlers.js";
import { defaultCharacterVoiceSettings } from "../utils/voiceLibrary.js";
import { voiceMap } from "../config/voiceMap.js";
import fs from "fs";

// Generate comprehensive voice list for GPT prompt
const generateVoiceListForPrompt = () => {
  let voiceList = "## AVAILABLE VOICES FOR CHARACTER VOICE MAPPING:\n\n";
  
  // Add instructions for GPT
  voiceList += `**IMPORTANT**: When creating characters, you MUST assign appropriate voice_id based on the character's:
- Gender (male/female)
- Age (young/teen/adult/elderly) 
- Role (protagonist/antagonist/supporting/mentor)
- Personality traits (brave, mysterious, kind, etc.)
- Story context (adventure, fantasy, horror, etc.)

**VOICE SELECTION RULES:**
1. **Gender Match**: Male characters use male voices, female characters use female voices
2. **Age Match**: Young characters (under 18) use young voices, adults use adult voices, elderly use elderly voices
3. **Role Match**: 
   - Protagonists: Use confident, engaging voices
   - Antagonists: Use deeper, more intense voices
   - Mentors: Use wise, calm voices
   - Supporting: Use friendly, approachable voices
4. **Personality Match**: Match voice characteristics to character traits
5. **Consistency**: Use the SAME voice_id for each character throughout the entire story

\n`;

  Object.keys(voiceMap).forEach(category => {
    if (category === 'all') return; // Skip the 'all' category
    
    voiceList += `### ${category.toUpperCase()} VOICES:\n`;
    
    // Show all age groups for this category
    ['young', 'teen', 'adult', 'elderly'].forEach(ageGroup => {
      const voices = voiceMap[category][ageGroup] || [];
      if (voices.length > 0) {
        voiceList += `\n**${ageGroup.toUpperCase()} ${category.toUpperCase()}:**\n`;
        voices.forEach(voice => {
          const description = voice.description || 'Professional voice';
          const accent = voice.accent ? ` (${voice.accent} accent)` : '';
          const useCase = voice.use_case ? ` - ${voice.use_case}` : '';
          voiceList += `- **"${voice.id}"** - ${voice.name}${accent}${useCase}\n`;
        });
      }
    });
    voiceList += "\n";
  });
  
  // Add special recommendations
  voiceList += `## RECOMMENDED VOICE SELECTIONS BY CHARACTER TYPE:\n\n`;
  voiceList += `**For Young Male Heroes (12-18):**\n`;
  voiceList += `- "TX3LPaxmHKxFdv7VOQHJ" (Liam) - Energetic, confident\n`;
  voiceList += `- "8JVbfL6oEdmuxKn5DK2C" (Johnny Kid) - Serious, determined\n\n`;
  
  voiceList += `**For Young Female Heroes (12-18):**\n`;
  voiceList += `- "ZF6FPAbjXT4488VcRRnw" (Amelia) - Clear, enthusiastic\n`;
  voiceList += `- "Crm8VULvkVs5ZBDa1Ixm" (Andrea Wolff) - Youthful, clear\n\n`;
  
  voiceList += `**For Adult Male Characters (25-50):**\n`;
  voiceList += `- "EkK5I93UQWFDigLMpZcX" (James) - Husky, engaging\n`;
  voiceList += `- "5Q0t7uMcjvnagumLfvZi" (Paul) - Professional, clear\n\n`;
  
  voiceList += `**For Adult Female Characters (25-50):**\n`;
  voiceList += `- "EXAVITQu4vr4xnSDxMaL" (Sarah) - Confident, warm\n`;
  voiceList += `- "9BWtsMINqrJLrRacOk9x" (Aria) - Elegant, sophisticated\n\n`;
  
  voiceList += `**For Villains/Antagonists:**\n`;
  voiceList += `- "2EiwWnXFnvU5JabPnv8n" (Clyde) - Deep, menacing\n`;
  voiceList += `- "VR6AewLTigWG4xSOukaG" (Arnold) - Gruff, intimidating\n\n`;
  
  voiceList += `**For Wise Mentors/Elderly:**\n`;
  voiceList += `- "EiNlNiXeDU1pqqOPrYMO" (John Doe) - Deep, wise\n`;
  voiceList += `- "iUqOXhMfiOIbBejNtfLR" (W. Storytime Oxley) - Rich, storytelling\n\n`;
  
  voiceList += `**For Mysterious/Otherworldly Characters:**\n`;
  voiceList += `- "1hlpeD1ydbI2ow0Tt3EW" (Oracle X) - Mysterious, otherworldly\n\n`;
  
  return voiceList;
};

// Timeline utility functions (inline implementation)
const timelineDialogueText = (timeline = []) => {
  return timeline
    .flatMap((entry) => {
      if (!entry?.type) {
        return [];
      }

      if (entry.type === 'narration' || entry.type === 'narrator') {
        return entry.text ? [entry.text] : [];
      }

      if (entry.type === 'character') {
        return entry.text ? [`${entry.name ?? 'Character'} says ${entry.text}`] : [];
      }

      return [];
    })
    .join(' ');
};
const narratorTypes = new Set(['narration', 'narrator']);

const normaliseTimelineEntry = (entry = {}) => {
  const rawType = entry.type ?? 'narration';
  const type = typeof rawType === 'string' ? rawType.toLowerCase() : 'narration';

  if (type === 'character') {
    return {
      type: 'character',
      name: entry.name,
      text: entry.text,
      traits: entry.traits ?? [],
    };
  }

  if (type === 'sfx' || type === 'sound_effect') {
    return {
      type: 'sfx',
      description: entry.description ?? entry.text ?? 'Ambient sound',
      placeholder: entry.placeholder,
    };
  }

  return {
    type: narratorTypes.has(type) ? 'narration' : 'narration',
    text: entry.text,
  };
};

const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
let envChecked = false;

const ensureOpenAiKey = () => {
  if (process.env.OPENAI_API_KEY || envChecked) {
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Attempt to load backend/.env first
  loadEnv({ path: path.resolve(__dirname, "..", ".env"), override: false });

  // Fallback to repo-root/.env if still missing
  if (!process.env.OPENAI_API_KEY) {
    loadEnv({
      path: path.resolve(__dirname, "..", "..", ".env"),
      override: false,
    });
  }

  envChecked = true;
};

const asNumberOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normaliseVoiceSettings = (settings) => {
  if (!settings || typeof settings !== 'object') {
    return null;
  }

  const fallback = defaultCharacterVoiceSettings;
  return {
    stability: asNumberOrNull(settings.stability) ?? fallback.stability ?? 0.45,
    similarity_boost: asNumberOrNull(settings.similarity_boost) ?? fallback.similarity_boost ?? 0.8,
    style: asNumberOrNull(settings.style) ?? fallback.style ?? 0.2,
    speed: asNumberOrNull(settings.speed) ?? 1.0,
  };
};

const buildImageDescriptor = ({ name, appearance = {}, clothing, palette }) => {
  const parts = [];

  if (appearance.age) parts.push(appearance.age);
  if (appearance.hair) parts.push(appearance.hair);
  if (appearance.eyes) parts.push(appearance.eyes);
  if (appearance.skin) parts.push(appearance.skin);
  if (appearance.build) parts.push(appearance.build);
  if (appearance.height) parts.push(appearance.height);
  if (appearance.features || appearance.distinctive_features) {
    parts.push(appearance.features || appearance.distinctive_features);
  }
  if (clothing) parts.push(clothing);
  if (palette) parts.push(`color palette ${palette}`);

  const descriptor = parts.filter(Boolean).join(', ');
  return descriptor ? `${name}: ${descriptor}` : null;
};

const normaliseCharacterBible = (bible) => {
  if (!Array.isArray(bible)) {
    return [];
  }

  return bible
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const name = entry.name || entry.character_name || entry.character;
      if (!name) {
        return null;
      }

      const appearance = entry.appearance && typeof entry.appearance === 'object'
        ? {
            age: entry.appearance.age || entry.age || entry.age_description,
            hair: entry.appearance.hair || entry.hair,
            eyes: entry.appearance.eyes || entry.eyes,
            skin: entry.appearance.skin || entry.skin,
            build: entry.appearance.build || entry.build || entry.body_type,
            height: entry.appearance.height || entry.height,
            features:
              entry.appearance.distinctive_features ||
              entry.appearance.features ||
              entry.distinctive_features ||
              entry.features,
            distinctive_features:
              entry.appearance.distinctive_features ||
              entry.appearance.features ||
              entry.distinctive_features ||
              entry.features,
          }
        : {
            age: entry.age || entry.age_description,
            hair: entry.hair,
            eyes: entry.eyes,
            skin: entry.skin,
            build: entry.build || entry.body_type,
            height: entry.height,
            features: entry.distinctive_features || entry.features,
            distinctive_features: entry.distinctive_features || entry.features,
          };

      const voice = entry.voice && typeof entry.voice === 'object' ? entry.voice : {};
      const voiceId =
        entry.voice_id ||
        entry.voiceId ||
        voice.id ||
        voice.voice_id ||
        (entry.voice && entry.voice.voice_id);

      const voiceSettings =
        normaliseVoiceSettings(entry.voice_settings || voice.settings) ||
        normaliseVoiceSettings(entry.voiceSettings);

      const profile = {
        name,
        role: entry.role || entry.type || (entry.is_main ? 'main' : undefined),
        summary: entry.summary || entry.description || entry.personality_summary,
        appearance,
        clothing: entry.wardrobe || entry.clothing || entry.outfit,
        palette: entry.palette || entry.color_palette || entry.colours,
        voiceId,
        voiceSettings,
        imagePrompt: entry.image_prompt || entry.imagePrompt,
      };

      profile.imageDescriptor = profile.imagePrompt || buildImageDescriptor(profile);

      return profile;
    })
    .filter(Boolean);
};

const ensureVoiceAssignment = (assignment) => {
  if (!assignment) {
    return null;
  }

  const base = normaliseVoiceSettings(assignment.voiceSettings || assignment.voice_settings);

  return {
    voiceId: assignment.voiceId || assignment.voice_id,
    voiceSettings: base || {
      ...defaultCharacterVoiceSettings,
      speed: 1.0,
    },
  };
};

const applyCharacterConsistency = (story, rawCharacterBible) => {
  const characterBible = normaliseCharacterBible(rawCharacterBible);

  if (!story || !Array.isArray(story.pages)) {
    return {
      ...story,
      characterBible,
      characters: characterBible.map(({ name, summary, role }) => ({
        name,
        summary,
        role,
      })),
    };
  }

  const characterMap = new Map();

  characterBible.forEach((profile) => {
    characterMap.set(profile.name.toLowerCase(), profile);
  });

  const voiceAssignments = new Map();

  characterBible.forEach((profile) => {
    if (profile.voiceId) {
      voiceAssignments.set(profile.name.toLowerCase(), {
        voiceId: profile.voiceId,
        voiceSettings:
          profile.voiceSettings || {
            ...defaultCharacterVoiceSettings,
            speed: 1.0,
          },
      });
    }
  });

  const upsertAssignment = (name, assignment) => {
    if (!name) return;
    const key = name.toLowerCase();
    if (!assignment?.voiceId) {
      return;
    }
    const existing = voiceAssignments.get(key);
    if (!existing) {
      voiceAssignments.set(key, {
        voiceId: assignment.voiceId,
        voiceSettings:
          assignment.voiceSettings ||
          {
            ...defaultCharacterVoiceSettings,
            speed: 1.0,
          },
      });
      return;
    }

    voiceAssignments.set(key, {
      voiceId: existing.voiceId,
      voiceSettings:
        existing.voiceSettings ||
        assignment.voiceSettings ||
        {
          ...defaultCharacterVoiceSettings,
          speed: 1.0,
        },
    });
  };

  // First pass: gather assignments from timelines
  story.pages.forEach((page) => {
    (page.timeline || []).forEach((entry) => {
      if (entry?.type !== 'character' || !entry.name) {
        return;
      }

      const assignment = ensureVoiceAssignment(entry);
      if (assignment) {
        upsertAssignment(entry.name, assignment);
      }
    });
  });

  // Second pass: enforce assignments and enhance image prompts
  story.pages.forEach((page) => {
    const pageCharacters = new Set();
    page.timeline = (page.timeline || []).map((entry) => {
      if (!entry || entry.type !== 'character' || !entry.name) {
        return entry;
      }

      const key = entry.name.toLowerCase();
      pageCharacters.add(key);
      const assignment = voiceAssignments.get(key);
      if (assignment?.voiceId) {
        entry.voiceId = assignment.voiceId;
        entry.voice_id = assignment.voiceId;
      }
      if (assignment?.voiceSettings) {
        entry.voiceSettings = assignment.voiceSettings;
        entry.voice_settings = assignment.voiceSettings;
      }

      return entry;
    });

    if (pageCharacters.size > 0) {
      const descriptors = [...pageCharacters]
        .map((key) => characterMap.get(key))
        .filter(Boolean)
        .map((profile) => profile.imageDescriptor)
        .filter(Boolean);

      if (descriptors.length > 0) {
        const descriptorText = descriptors.join('. ');
        const prompt = page.imagePrompt || page.image_prompt;
        const consistencyNote = `Consistent characters: ${descriptorText}.`;
        if (prompt?.includes('Consistent characters:')) {
          page.imagePrompt = prompt;
        } else if (prompt) {
          page.imagePrompt = `${prompt.trim()} ${consistencyNote}`;
        } else {
          page.imagePrompt = consistencyNote;
        }
      }
    }
  });

  const enrichedStory = {
    ...story,
    characterBible,
    characters: characterBible.map(({ name, summary, role }) => ({
      name,
      summary,
      role,
    })),
  };

  return enrichedStory;
};

const buildUserPrompt = ({
  theme,
  storyDetails, // User's custom story details
  genre,
  targetAgeGroup,
  storyLength = 6,
  artStyle,
  mainCharacter,
  supportingCharacters = [],
  narrationTone,
}) => ({
  theme,
  storyDetails: storyDetails || undefined, // Include if provided
  genre,
  targetAgeGroup,
  storyLength,
  artStyle,
  narrationTone,
  mainCharacter,
  supportingCharacters,
});

const parseTimeline = (timeline = []) => {
  return timeline
    .map(normaliseTimelineEntry)
    .filter((entry) => Boolean(entry?.type));
};

const parseStoryFromContent = (content) => {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new HttpError(502, "OpenAI returned non-JSON content.", { content });
  }

  // Handle new pages[] structure
  if (Array.isArray(parsed?.pages)) {
    const pages = parsed.pages.map((page, index) => {
      const pageNumber = page.page ?? index + 1;
      
      // Process timeline entries
      const timeline = Array.isArray(page.timeline) ? page.timeline.map(entry => {
        const baseEntry = {
          type: entry.type,
          text: entry.text,
        };

        // Add type-specific fields
        if (entry.type === 'narration') {
          return {
            ...baseEntry,
            voiceId: entry.voice_id,
            voiceSettings: entry.voice_settings,
          };
        } else if (entry.type === 'character') {
          return {
            ...baseEntry,
            name: entry.name,
            emotion: entry.emotion,
            voiceId: entry.voice_id,
            voiceSettings: entry.voice_settings,
          };
        } else if (entry.type === 'sfx') {
          console.log(`[gptService] Processing SFX entry: "${entry.description || entry.placeholder || entry.text}"`);
          return {
            ...baseEntry,
            description: entry.description,
            placeholder: entry.placeholder,
            text: entry.placeholder || entry.description,
          };
        }
        
        return baseEntry;
      }) : [];

      return {
        pageNumber,
        title: page.scene_title || `Scene ${pageNumber}`,
        setting: page.scene_title || `Scene ${pageNumber}`,
        imagePrompt: page.image_prompt,
        summary: timeline.find(entry => entry.type === 'narration')?.text || page.scene_title || `Scene ${pageNumber}`,
        timeline,
        dialogueText: timelineDialogueText(timeline),
      };
    });

    const story = {
      title: parsed.title ?? "The Epic Adventure",
      logline: parsed.genre
        ? `${parsed.genre} - ${parsed.target_audience}`
        : "An Epic Adventure Awaits",
      pages,
      fullText: null,
      metadata: {
        genre: parsed.genre,
        targetAudience: parsed.target_audience,
        theme: themeFromPages(pages),
      },
    };

    const enrichedStory = applyCharacterConsistency(
      story,
      parsed.character_bible || parsed.characters
    );

    const fullTimelineText = (enrichedStory.pages || [])
      .map((page) => page.dialogueText)
      .join("\n\n");

    return {
      ...enrichedStory,
      fullText: fullTimelineText,
    };
  }

  // Fallback to old scenes[] structure for backward compatibility
  if (!Array.isArray(parsed?.scenes)) {
    throw new HttpError(502, "Story payload missing pages or scenes array.", { parsed });
  }

  const scenes = parsed.scenes.map((scene, index) => {
    const sceneNumber = scene.scene_number ?? index + 1;

    // Convert scenes to pages format for compatibility
    const timeline = [];

    // Add narration
    if (scene.narration) {
      timeline.push({
        type: "narration",
        text: scene.narration.text,
        voice: scene.narration.voice,
        voiceId: scene.narration.voice_id,
      });
    }

    // Add characters
    if (Array.isArray(scene.characters)) {
      scene.characters.forEach((char) => {
        timeline.push({
          type: "character",
          name: char.name,
          text: char.text,
          voice: char.voice,
          voiceId: char.voice_id,
        });
      });
    }

    // Add SFX
    if (Array.isArray(scene.sfx)) {
      console.log(`[gptService] Adding ${scene.sfx.length} SFX entries to timeline for scene ${sceneNumber}`);
      scene.sfx.forEach((sfx, index) => {
        console.log(`[gptService] SFX ${index + 1}: "${sfx}"`);
        timeline.push({
          type: "sfx",
          description: sfx,
          text: sfx,
        });
      });
    } else {
      console.log(`[gptService] No SFX found for scene ${sceneNumber}`);
    }

    return {
      pageNumber: sceneNumber,
      title: scene.title,
      setting: scene.title,
      imagePrompt: scene.image_prompt,
      summary: scene.narration?.text || scene.title,
      timeline,
      dialogueText: timelineDialogueText(timeline),
    };
  });

  const story = {
    title: parsed.title ?? "The Epic Adventure",
    logline: parsed.genre
      ? `${parsed.genre} - ${parsed.target_audience}`
      : "An Epic Adventure Awaits",
    pages: scenes, // Keep as pages for compatibility
    fullText: null,
    metadata: {
      genre: parsed.genre,
      targetAudience: parsed.target_audience,
      theme: parsed.theme ?? themeFromPages(scenes),
    },
  };

  const enrichedStory = applyCharacterConsistency(
    story,
    parsed.character_bible || parsed.characters
  );

  const fullTimelineText = (enrichedStory.pages || [])
    .map((scene) => scene.dialogueText)
    .join("\n\n");

  return {
    ...enrichedStory,
    fullText: fullTimelineText,
  };
};

const themeFromPages = (pages) => {
  if (!Array.isArray(pages) || pages.length === 0) {
    return undefined;
  }

  return pages[0]?.summary;
};

const loadVoicePrompt = () => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const voicePromptPath = path.join(__dirname, '..', '..', 'data', 'voicePrompt.txt');
    return fs.readFileSync(voicePromptPath, 'utf8');
  } catch (error) {
    console.warn('Could not load voice prompt:', error.message);
    return '';
  }
};

// Generate dynamic story structure based on length
const getStoryStructureGuide = (storyLength) => {
  if (storyLength <= 2) {
    return `**2-Page Structure (Simple Story):**
    1. **Setup & Conflict**: Introduce characters and establish the main challenge or situation
    2. **Resolution**: Resolve the conflict and show character growth or outcome
    
    Focus on a single, clear conflict that can be resolved quickly.`;
  } else if (storyLength <= 4) {
    return `**3-4 Page Structure (Short Story):**
    1. **Setup**: Introduce characters and establish the world naturally
    2. **Rising Action**: Develop the conflict and build tension
    3. **Climax**: Peak emotional moment or decisive action
    4. **Resolution**: Quick resolution and character growth
    
    Each page should advance the story significantly.`;
  } else if (storyLength <= 6) {
    return `**5-6 Page Structure (Medium Story):**
    1. **Setup**: Introduce characters and establish the world naturally
    2. **Rising Action**: Develop the conflict and build tension through character interactions
    3. **Climax**: Peak emotional confrontation or decisive moment
    4. **Falling Action**: Consequences and reactions to the climax
    5. **Resolution**: Character growth and satisfying conclusion through dialogue
    6. **Epilogue** (if 6 pages): Brief aftermath or reflection
    
    Allow for more character development and plot complexity.`;
  } else {
    return `**7+ Page Structure (Long Story):**
    1. **Setup**: Introduce characters and establish the world naturally
    2. **Inciting Incident**: Event that starts the main conflict
    3. **Rising Action**: Develop the conflict and build tension through character interactions
    4. **Midpoint**: Major plot twist or character revelation
    5. **Crisis**: Escalating tension and complications
    6. **Climax**: Peak emotional confrontation or decisive moment
    7. **Falling Action**: Consequences and reactions to the climax
    8. **Resolution**: Character growth and satisfying conclusion through dialogue
    9. **Epilogue** (if 8+ pages): Brief aftermath or reflection
    
    Allow for complex character arcs and multiple plot threads.`;
  }
};

// Generate page-by-page guidelines based on story length
const getPageByPageGuide = (storyLength) => {
  if (storyLength <= 2) {
    return `**Page 1**: Setup & Conflict - Introduce characters and establish the main challenge
**Page 2**: Resolution - Resolve the conflict and show outcome`;
  } else if (storyLength <= 4) {
    return `**Page 1**: Setup - Introduce characters and establish the world
**Page 2**: Rising Action - Develop conflict and build tension
**Page 3**: Climax - Peak emotional moment or decisive action
**Page 4**: Resolution - Quick resolution and character growth`;
  } else if (storyLength <= 6) {
    return `**Page 1**: Setup - Introduce characters and establish the world
**Page 2**: Rising Action - Develop conflict and build tension
**Page 3**: Rising Action - Continue building tension through character interactions
**Page 4**: Climax - Peak emotional confrontation or decisive moment
**Page 5**: Falling Action - Consequences and reactions to the climax
**Page 6**: Resolution - Character growth and satisfying conclusion`;
  } else {
    return `**Page 1**: Setup - Introduce characters and establish the world
**Page 2**: Inciting Incident - Event that starts the main conflict
**Page 3**: Rising Action - Develop conflict and build tension
**Page 4**: Rising Action - Continue building tension through character interactions
**Page 5**: Midpoint - Major plot twist or character revelation
**Page 6**: Crisis - Escalating tension and complications
**Page 7**: Climax - Peak emotional confrontation or decisive moment
**Page 8**: Falling Action - Consequences and reactions to the climax
**Page 9+**: Resolution - Character growth and satisfying conclusion`;
  }
};

export const createStory = async (options) => {
  ensureOpenAiKey();
  const voicePrompt = loadVoicePrompt();
  const voiceList = generateVoiceListForPrompt();
  
  const prompt = `
    ## SYSTEM INSTRUCTIONS

    You are a cinematic story writer that creates emotionally engaging, dialogue-driven stories for AI-generated storybooks.
    Focus on character interactions to move the story forward.
    Use narration sparingly — only to describe scene transitions, atmosphere, or internal emotions that dialogue cannot convey.

    The story should feel like a radio drama or film script with vivid character voices and natural pacing.

    **CRITICAL: You MUST create a compelling, descriptive title for every story. Never use generic titles like "Untitled Story" or "Untitled Adventure".**
    Create titles that capture the essence of the story, such as:
    - "The Enchanted Forest Quest"
    - "Mystery of the Lost City" 
    - "Adventure in the Crystal Caves"
    - "The Dragon's Last Stand"
    - "Journey to the Floating Islands"

    Your output must be strictly valid JSON that follows the timeline structure described below.

    Each page should include:
    - A timeline array containing 5-8 entries for rich, engaging scenes.
    - Dialogue as the main storytelling method (70–80% of content).
    - Occasional short narration (1–2 sentences) for transitions or mood.
    - Each page should have substantial content: 3-4 character interactions + 1-2 narration beats + optional SFX.
    - Optional sound effects (sfx) for emotional or environmental emphasis.
    - An image_prompt describing the visual look and mood of the scene, including detailed descriptions of ALL characters appearing in the scene (main characters, villains, strangers, supporting characters).

    ## USER'S STORY REQUEST
    ${options.storyDetails ? `
    **Story Details from User:**
    ${options.storyDetails}
    
    ⚠️ IMPORTANT: Follow the user's story details closely. Include the plot points, scenes, and story elements they requested.
    If the user specified specific events or scenes, make sure to include them in the appropriate pages.
    ` : ''}

    ## CHARACTER INFORMATION
    **Main Character:** ${options.mainCharacter?.name || 'Alex'} (${options.mainCharacter?.gender || 'male'}) - ${options.mainCharacter?.traits?.join(', ') || 'brave, curious'}
    
    **Supporting Characters:**
    ${options.supportingCharacters?.map(char => `- ${char.name} (${char.gender || 'non-binary'}) - ${char.traits?.join(', ') || 'loyal'}`).join('\n    ') || '- Sam (female) - loyal, inventive'}
    
    **CRITICAL CHARACTER CONSISTENCY RULES:**
    1. **Physical Descriptions**: Create detailed, consistent physical descriptions for each character including:
       - Age and appearance (hair color, eye color, build, height)
       - Clothing style and colors
       - Distinctive features (scars, accessories, etc.)
       - Personality reflected in appearance
    
    2. **Character Voice Mapping**: Use the character gender information above to select appropriate voices. Male characters should use male voices, female characters should use female voices.
    
    3. **Image Prompt Consistency**: In every image_prompt, include detailed character descriptions to maintain visual consistency across all scenes:
       - Always mention the character's physical appearance
       - Include clothing details and colors
       - Maintain the same visual style throughout the story
       - Example: "A young woman with long auburn hair and green eyes, wearing a blue tunic and brown leather boots, standing confidently in a mystical forest"

    ## CHARACTER BIBLE OUTPUT (MANDATORY)
    At the top level of the JSON response, include a "character_bible" array covering every recurring character (main, supporting, or newly introduced). Each entry must contain:
    - "name": Character name (must match the dialogue timeline exactly)
    - "role": One of "protagonist", "supporting", "antagonist", or "narrator"
    - "summary": One sentence describing personality, motivation, and relationship to others
    - "appearance": Object with fields "age", "hair", "eyes", "skin", "build", "height", and "distinctive_features"
    - "wardrobe": Consistent outfit description with colors and accessories
    - "palette": 3-4 color keywords that define the visual palette
    - "voice_id": **CRITICAL** - Choose exactly one voice ID from the voice list below based on:
      * Character gender (male/female)
      * Character age (young/teen/adult/elderly)
      * Character role (protagonist/antagonist/supporting/mentor)
      * Character personality (brave, mysterious, kind, etc.)
      * Story context (adventure, fantasy, horror, etc.)
    - "voice_settings": Object with numeric values for "stability", "similarity_boost", "style", and "speed"
    - "image_prompt": A single, camera-ready sentence summarising how this character should look in illustrations
    
    **VOICE SELECTION EXAMPLES:**
    - Young male hero (12-18): Use "TX3LPaxmHKxFdv7VOQHJ" (Liam) or "8JVbfL6oEdmuxKn5DK2C" (Johnny Kid)
    - Young female hero (12-18): Use "ZF6FPAbjXT4488VcRRnw" (Amelia) or "Crm8VULvkVs5ZBDa1Ixm" (Andrea Wolff)
    - Adult male protagonist: Use "EkK5I93UQWFDigLMpZcX" (James) or "5Q0t7uMcjvnagumLfvZi" (Paul)
    - Adult female protagonist: Use "EXAVITQu4vr4xnSDxMaL" (Sarah) or "9BWtsMINqrJLrRacOk9x" (Aria)
    - Villain/antagonist: Use "2EiwWnXFnvU5JabPnv8n" (Clyde) or "VR6AewLTigWG4xSOukaG" (Arnold)
    - Wise mentor/elderly: Use "EiNlNiXeDU1pqqOPrYMO" (John Doe) or "iUqOXhMfiOIbBejNtfLR" (W. Storytime Oxley)
    - Mysterious character: Use "1hlpeD1ydbI2ow0Tt3EW" (Oracle X)
    
    Only use characters defined in this bible in the story. If a new named character is absolutely necessary, add them to the bible as well.

    ## STORY STRUCTURE
    Create exactly ${options.storyLength || 4} pages following a dynamic structure based on length:
    
    ${getStoryStructureGuide(options.storyLength || 4)}
    
    IMPORTANT: Generate exactly ${options.storyLength || 6} pages, no more, no less.
    
    ## PAGE-BY-PAGE GUIDELINES
    ${getPageByPageGuide(options.storyLength || 4)}

    ## TIMELINE STRUCTURE
    Each timeline entry must be one of these types:

    ### NARRATION (Use sparingly - 20-30% of content)
    - type: "narration"
    - voice_id: "${options.narrationVoiceId || 'EkK5I93UQWFDigLMpZcX'}" (Use the selected narrator voice consistently throughout the story)
    - voice_settings: Use emotion presets (see below)
    - text: Short, atmospheric narration (1-2 sentences max)

    ### CHARACTER (Main content - 70-80% of timeline)
    - type: "character" 
    - name: Character name
    - emotion: One of the emotion presets (see below)
    - voice_id: **MUST match the voice_id assigned in character_bible** - Use the exact same voice_id for this character throughout the entire story
    - voice_settings: Use emotion presets (see below)
    - text: Natural dialogue without stage directions - just the spoken words

    ### SFX (Optional - for emphasis and atmosphere)
    - type: "sfx"
    - description: Detailed sound effect description for contextual generation
    - placeholder: Text representation like "CRACK—!" or "WHOOSH!"
    
    **CRITICAL SFX RULE**: NEVER use SFX without preceding narration!
    - **MANDATORY Pattern**: [Narration] → [SFX] (SFX alone is FORBIDDEN)
    - **Why**: Listeners need context to understand what the sound represents
    - **Examples**: 
      * ❌ WRONG: Direct SFX "Footsteps crunching in the sand"
      * ✅ CORRECT: Narration: "선원들은 하나, 둘씩 땅에 발을 디뎠습니다" → SFX: "Footsteps crunching in the sand"
      * ❌ WRONG: Direct SFX "Rustling leaves and creaking branches"  
      * ✅ CORRECT: Narration: "그 때! 나무가 흔들렸어요!" → SFX: "Rustling leaves and creaking branches"
    - **Rule**: Every SFX entry MUST have a narration entry immediately before it
    
    **SFX Guidelines:**
    - **Short sounds (1-2s)**: clicks, snaps, pops, beeps, dings, ticks, taps, knocks
    - **Action sounds (2-3s)**: crashes, bangs, explosions, cracks, slams, thuds, splashes, whooshes
    - **Movement sounds (3s)**: footsteps, walking, running, rustling, creaking, doors, gates
    - **Vocal sounds (2-3s)**: laughs, whispers, murmurs, chatter, giggles, sighs, gasps
    - **Natural sounds (4s)**: thunder, engines, motors, bells, alarms, sirens, horns
    - **Ambient sounds (4s)**: wind, rain, forest, ocean, waves, birds, crickets, atmosphere
    
    **MANDATORY SFX Patterns (Copy these exactly):**
    - **Footsteps**: Narration: "선원들은 하나, 둘씩 땅에 발을 디뎠습니다" → SFX: "Footsteps crunching in the sand"
    - **Tree Movement**: Narration: "그 때! 나무가 흔들렸어요!" → SFX: "Rustling leaves and creaking branches"
    - **Chest Opening**: Narration: "그 때! 상자가 천천히 열리기 시작했어요!" → SFX: "Creaking of the chest as it slowly opens"
    - **Lightning**: Narration: "하늘이 갈라지며 번개가 내리쳤어요!" → SFX: "Sharp crack of lightning splitting the sky"
    - **Approaching Steps**: Narration: "누군가 조심스럽게 걸어오는 소리가 들렸어요" → SFX: "Gentle footsteps on wooden floorboards"
    - **Thunder**: Narration: "먼 곳에서 천둥소리가 울려 퍼졌어요" → SFX: "Distant thunder rumbling across the valley"
    - **Door Opening**: Narration: "문이 삐걱거리며 열리기 시작했어요" → SFX: "Creaking door hinges"
    - **Water Splash**: Narration: "물이 튀며 파도가 일렁였어요" → SFX: "Water splashing and waves"

    ## EMOTION PRESETS & VOICE SETTINGS
    Use these emotion presets when creating voice_settings for narration and characters:

    | Emotion | Description | stability | similarity_boost | style | speed |
    |---------|-------------|-----------|------------------|-------|-------|
    | calm | Neutral tone, steady delivery | 0.85 | 0.8 | 0.2 | 1.0 |
    | narrative | Balanced and professional (for narrator) | 0.9 | 0.9 | 0.15 | 1.0 |
    | curious | Inquisitive, wondering tone | 0.6 | 0.7 | 0.7 | 1.05 |
    | anger | Intense, harsh, sharp articulation | 0.4 | 0.7 | 0.9 | 0.95 |
    | fear | Shaky, hesitant tone | 0.5 | 0.6 | 0.8 | 1.05 |
    | sadness | Slower, softer, lower energy | 0.5 | 0.7 | 0.7 | 0.9 |
    | joy | Bright, cheerful tone | 0.6 | 0.6 | 0.8 | 1.1 |
    | determined | Confident and bold | 0.5 | 0.7 | 0.8 | 1.0 |
    | mysterious | Whisper-like, controlled tone | 0.7 | 0.8 | 0.4 | 0.95 |
    | villainous | Deep, dramatic, confident tone | 0.45 | 0.7 | 0.85 | 0.95 |

    👉 Narration usually uses "narrative" preset.
    👉 Characters should reflect the emotional context of their dialogue.

    ## CONTENT LENGTH GUIDELINES
    **Each page should contain 5-8 timeline entries for rich storytelling:**
    - **3-4 Character dialogue exchanges** (main content)
    - **1-2 Narration beats** (scene setting, transitions)
    - **0-2 Sound effects** (environmental, emotional emphasis)
    - **Total: 5-8 entries per page** for substantial, engaging scenes
    
    ## SFX VALIDATION RULES
    **Before generating any SFX, check:**
    1. Is there a narration entry immediately before this SFX?
    2. Does the narration explain what sound is about to happen?
    3. If NO to either question, add narration first or remove SFX
    
    **SFX Checklist:**
    - ✅ Narration: "선원들은 하나, 둘씩 땅에 발을 디뎠습니다"
    - ✅ SFX: "Footsteps crunching in the sand"
    - ❌ SFX: "Footsteps crunching in the sand" (without narration)

    ## EXAMPLE JSON STRUCTURE
    {
      "title": "The Awakening",
      "genre": "Fantasy Adventure",
      "target_audience": "General",
      "pages": [
        {
          "page": 1,
          "scene_title": "The Awakening",
          "timeline": [
            {
              "type": "narration",
              "voice_id": "EkK5I93UQWFDigLMpZcX",
              "voice_settings": {
                "stability": 0.9,
                "similarity_boost": 0.9,
                "style": 0.15,
                "speed": 1.0
              },
              "text": "The night was silent, except for the wind that whispered through the ruins."
            },
            {
              "type": "character",
              "name": "Taeil",
              "emotion": "curious",
              "voice_id": "ZF6FPAbjXT4488VcRRnw",
              "voice_settings": {
                "stability": 0.6,
                "similarity_boost": 0.7,
                "style": 0.7,
                "speed": 1.05
              },
              "text": "Strange... this place feels alive. Almost like it's breathing."
            },
            {
              "type": "character",
              "name": "Guardian",
              "emotion": "mysterious",
              "voice_id": "2EiwWnXFnvU5JabPnv8n",
              "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.7,
                "style": 0.8,
                "speed": 0.95
              },
              "text": "It breathes because it remembers, human. Every echo here has a name."
            },
            {
              "type": "character",
              "name": "Taeil",
              "emotion": "fear",
              "voice_id": "ZF6FPAbjXT4488VcRRnw",
              "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.6,
                "style": 0.8,
                "speed": 1.1
              },
              "text": "Who's there?! Show yourself!"
            },
            {
              "type": "narration",
              "voice_id": "EkK5I93UQWFDigLMpZcX",
              "voice_settings": {
                "stability": 0.9,
                "similarity_boost": 0.9,
                "style": 0.15,
                "speed": 1.0
              },
              "text": "그 때! 땅이 갈라지며 거대한 돌이 깨어났어요!"
            },
            {
              "type": "sfx",
              "description": "Stone cracking as a giant awakens beneath the ruins",
              "placeholder": "CRACK—!"
            },
            {
              "type": "narration",
              "voice_id": "EkK5I93UQWFDigLMpZcX",
              "voice_settings": {
                "stability": 0.9,
                "similarity_boost": 0.9,
                "style": 0.2,
                "speed": 1.0
              },
              "text": "The ground trembled, and an ancient guardian rose from the depths."
            }
          ],
          "image_prompt": "Cinematic fantasy scene featuring Taeil, a 22-year-old young man with short dark brown hair and determined brown eyes, wearing a weathered brown leather jacket and dark pants, standing bravely before a massive ancient stone guardian rising from the ground in a storm of dust and mystical golden light, dramatic lighting with ethereal glow, wide shot composition, high-quality digital art style"
        },
        {
          "page": 2,
          "scene_title": "The Dark Stranger",
          "timeline": [
            {
              "type": "character",
              "name": "Dark Stranger",
              "emotion": "villainous",
              "voice_id": "2EiwWnXFnvU5JabPnv8n",
              "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.7,
                "style": 0.85,
                "speed": 0.95
              },
              "text": "You have awakened what should have remained buried, mortal."
            }
          ],
          "image_prompt": "Cinematic fantasy scene featuring Taeil, a 22-year-old young man with short dark brown hair and determined brown eyes, wearing a weathered brown leather jacket, facing off against a mysterious Dark Stranger - a tall, imposing figure with long silver hair, piercing red eyes, wearing a dark hooded cloak with silver trim, menacing expression, standing in ancient ruins with dramatic shadows and mystical lighting, wide shot composition, high-quality digital art style"
        }
      ]
    }

    ## SOUND EFFECTS (SFX) GUIDELINES
    Create diverse and specific sound effects that enhance the story atmosphere:
    
    **Environment Sounds** (long duration, ambient):
    - "Wind howling through ancient trees"
    - "Gentle rain pattering on leaves"
    - "Crackling campfire in the distance"
    - "Ocean waves crashing against rocks"
    
    **Action/Impact Sounds** (short, sharp):
    - "Sword clashing against metal armor"
    - "Door slamming shut with a heavy thud"
    - "Glass shattering into pieces"
    - "Thunder crackling across the sky"
    
    **Movement Sounds** (medium duration):
    - "Footsteps echoing in empty corridors"
    - "Leaves rustling as someone approaches"
    - "Horse hooves galloping on cobblestone"
    - "Wings flapping as a bird takes flight"
    
    **Character Sounds** (short, emotional):
    - "Soft laughter echoing in the room"
    - "Gasp of surprise and wonder"
    - "Sigh of relief after tension"
    - "Whispered conversation in the shadows"
    
    **Magical/Mystical Sounds** (unique, atmospheric):
    - "Crystal humming with magical energy"
    - "Ancient spell casting with ethereal tones"
    - "Portal opening with dimensional crackling"
    - "Mystical chimes resonating through the air"

    ## IMPORTANT RULES
    1. **Rich Content**: Each page must contain 5-8 timeline entries for substantial storytelling
    2. **Dialogue First**: 70-80% of content should be character dialogue
    3. **Minimal Narration**: Use narration only for scene transitions and atmosphere (1-2 sentences max)
    4. **Natural Speech**: Character dialogue should be natural, without stage directions in quotes
    5. **Consistent Voices**: 
       - **CRITICAL**: Use the SAME voice_id for each character across ALL pages - this is assigned in character_bible
       - Use the SAME narrator voice_id "${options.narrationVoiceId || 'EkK5I93UQWFDigLMpZcX'}" throughout the entire story
       - Match character gender to voice gender: male characters use male voices, female characters use female voices
       - Match character age to voice age: young characters use young voices, adults use adult voices
       - Match character role to voice characteristics: heroes use confident voices, villains use intense voices
       - Example: If Alex (male, young hero) uses "TX3LPaxmHKxFdv7VOQHJ" in character_bible, use the same ID for Alex in all timeline entries
    6. **Emotional Authenticity**: Use appropriate emotion presets for each character's state
    7. **Radio Drama Feel**: Focus on character interactions and emotional beats
    8. **Diverse SFX**: Use varied sound effects that match the scene's mood and action
    9. **SFX Context**: MANDATORY - Every SFX MUST be preceded by narration. NEVER use SFX alone. This is CRITICAL for listener understanding.
    10. **Image Prompts**: Create detailed, cinematic image prompts for Seedream 4.0 that include:
        - **Character Consistency**: Always include detailed character descriptions (age, hair color, eye color, clothing, distinctive features)
        - **ALL Characters**: Include descriptions for EVERY character appearing in the scene, including villains, strangers, and supporting characters
        - **Villain/Stranger Details**: When villains or strangers appear, provide their detailed physical description (gender, age, hair color, eye color, clothing, distinctive features, facial expressions)
        - **Scene Composition**: Describe the setting, lighting, and mood
        - **Visual Style**: Specify art style (cinematic, fantasy, realistic, etc.)
        - **Camera Angle**: Include perspective (close-up, wide shot, etc.)
        - **Example with Villain**: "Cinematic fantasy scene featuring Alex, a 22-year-old young man with short dark brown hair and determined brown eyes, wearing a weathered brown leather jacket, standing bravely before a mysterious stranger - a tall, imposing figure with long silver hair, piercing red eyes, wearing a dark hooded cloak with silver trim, menacing expression, dramatic lighting with shadows and ethereal glow, wide shot composition, high-quality digital art style"
    11. **Character Appearance Rules**: 
        - **MANDATORY**: Every character that appears in dialogue MUST be described in the image_prompt
        - **Villains/Strangers**: Must include gender, age, hair color, eye color, clothing, distinctive features, and facial expression
        - **Consistency**: Use the same physical description for the same character across all pages
        - **Format**: "Character Name, [age]-year-old [gender] with [hair description] and [eye color] eyes, wearing [clothing], [distinctive features], [facial expression]"

    ## OUTPUT JSON STRUCTURE
    The final response must be valid JSON with the following top-level fields:
    {
      "title": string (REQUIRED - Create an engaging, descriptive title that captures the essence of the story. Examples: "The Enchanted Forest Quest", "Mystery of the Lost City", "Adventure in the Crystal Caves"),
      "logline": string,
      "genre": string,
      "target_audience": string,
      "character_bible": [...],
      "pages": [...]
    }
    Every timeline entry must use the voice_id assigned in "character_bible", and each page's image_prompt must reference the appropriate character descriptions from the bible.

${voiceList}

${voicePrompt}

  `;

  if (!process.env.OPENAI_API_KEY) {
    throw new HttpError(500, "OPENAI_API_KEY is not configured.");
  }

  const payload = buildUserPrompt(options);

  try {
    const { data } = await axios.post(
      OPENAI_CHAT_COMPLETIONS_URL,
      {
        model: OPENAI_MODEL,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: prompt,
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new HttpError(502, "OpenAI returned an empty response.");
    }
    console.log("OpenAI response:", content);
    return parseStoryFromContent(content);
  } catch (error) {
    if (error.response) {
      // Log server-side details to help debugging during development
      // (keys are not logged; only response payload)
      console.error("OpenAI error response:", error.response.data);
    }
    if (error.response) {
      throw new HttpError(
        error.response.status,
        "OpenAI API error",
        error.response.data
      );
    }

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, "Failed to generate story with OpenAI.", {
      message: error.message,
    });
  }
};
