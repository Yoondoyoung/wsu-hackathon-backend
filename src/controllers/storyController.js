import { createStory } from '../services/gptService.js';
import {
  cloneVoiceFromSample,
  generateSoundEffect,
  synthesizeSpeech,
  listVoices,
} from '../services/elevenLabsService.js';
import { generateSceneIllustration } from '../services/runwareService.js';
import { mixPageAudio, applySFXFadeEffects } from '../services/audioMixerService.js';
import { asyncHandler, HttpError } from '../utils/errorHandlers.js';
import { matchCharacterVoice, matchNarrationVoice, defaultCharacterVoiceSettings } from '../utils/voiceLibrary.js';
import { saveBase64Asset } from '../utils/storage.js';
import { resolveVoiceId } from '../config/voiceMap.js';
import { processStory } from '../pipeline/storyPipeline.js';
import { createStoryState, getStoryState } from '../state/storyState.js';
import { 
  getOrCreateSession, 
  generateSessionId, 
  getSessionStats 
} from '../services/sessionService.js';
import { 
  saveStory, 
  updateStoryStatus, 
  updateStoryWithGeneratedContent,
  saveStoryPage, 
  updateStoryPage,
  getStory,
  getStoriesBySession,
  getAllStoriesFromDB,
  saveGenerationLog,
  getGenerationLogs,
  saveStoryAsset,
  saveAudioToDatabase
} from '../services/storyStorageService.js';
import { supabase } from '../config/supabase.js';

const parseTraits = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((trait) => String(trait).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((trait) => trait.trim())
    .filter(Boolean);
};

const parseSupportingCharacters = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(normaliseCharacterInput).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => normaliseCharacterInput(line.trim()))
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    const normalised = normaliseCharacterInput(value);
    return normalised ? [normalised] : [];
  }

  return [];
};

const normaliseCharacterInput = (input) => {
  if (!input) {
    return null;
  }

  if (typeof input === 'string') {
    const parts = input.split('|');
    const namePart = parts[0]?.trim();
    const genderPart = parts[1]?.trim();
    const traitsPart = parts[2]?.trim() || parts[1]?.trim();
    
    return {
      name: namePart,
      gender: genderPart && ['male', 'female', 'non-binary'].includes(genderPart.toLowerCase()) 
        ? genderPart.toLowerCase() 
        : 'non-binary',
      traits: parseTraits(traitsPart),
    };
  }

  if (typeof input === 'object') {
    return {
      name: input.name,
      gender: input.gender || 'non-binary',
      traits: parseTraits(input.traits),
      description: input.description,
    };
  }

  return null;
};

const buildStoryOptions = (body) => {
  const mainCharacter = normaliseCharacterInput(body.mainCharacter);
  const supportingCharacters = Array.isArray(body.supportingCharacters)
    ? body.supportingCharacters.map(normaliseCharacterInput).filter(Boolean)
    : [];

  return {
    theme: body.theme,
    storyDetails: body.storyDetails || undefined, // User's custom story details
    genre: body.genre,
    targetAgeGroup: body.targetAgeGroup,
    storyLength: Number(body.storyLength) || 6,
    artStyle: body.artStyle,
    narrationTone: body.narrationTone,
    mainCharacter,
    supportingCharacters,
  };
};

const assertRequiredStoryFields = (body) => {
  const required = ['theme', 'genre', 'targetAgeGroup', 'storyLength'];
  const missing = required.filter((field) => !body[field]);

  if (missing.length > 0) {
    throw new HttpError(400, `Missing required fields: ${missing.join(', ')}`);
  }
};

const resolveNarratorVoice = async ({ narrationTone, voiceSampleBase64, voiceSampleFormat, useUserVoice, narrationVoiceId, narrationVoiceAlias }) => {
  if (!useUserVoice && narrationVoiceAlias && !narrationVoiceId) {
    const resolved = resolveVoiceId(narrationVoiceAlias, 'narrator');
    if (resolved) narrationVoiceId = resolved;
  }
  if (!useUserVoice && narrationVoiceId) {
    return {
      voiceId: narrationVoiceId,
      voiceSettings: {
        stability: 0.5,
        similarity_boost: 0.85,
        style: 0.2,
      },
    };
  }
  if (useUserVoice && voiceSampleBase64) {
    const cloned = await cloneVoiceFromSample({
      sampleBase64: voiceSampleBase64,
      sampleFormat: voiceSampleFormat ?? 'mp3',
      name: 'User Narrator',
    });

    if (!cloned?.voiceId) {
      throw new HttpError(502, 'Voice cloning completed without returning a voice ID.');
    }

    return {
      voiceId: cloned.voiceId,
      voiceSettings: {
        stability: 0.55,
        similarity_boost: 0.85,
        style: 0.2,
      },
    };
  }

  return matchNarrationVoice(narrationTone);
};

const resolveCharacterVoice = (character) => {
  const traits = parseTraits(character?.traits);
  const voiceId = matchCharacterVoice(traits);
  return {
    voiceId,
    voiceSettings: defaultCharacterVoiceSettings,
  };
};

export const generateStory = asyncHandler(async (req, res) => {
  assertRequiredStoryFields(req.body ?? {});

  const story = await createStory(buildStoryOptions(req.body));
  res.status(201).json(story);
});

export const buildStoryPipeline = asyncHandler(async (req, res) => {
  assertRequiredStoryFields(req.body ?? {});

  // Get or create session
  const sessionId = req.headers['x-session-id'] || generateSessionId();
  const session = await getOrCreateSession(sessionId, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip || req.connection.remoteAddress
  });

  console.log(`[pipeline] Session ${sessionId}: starting story generation`);

  // Create story in database
  const storyData = {
    title: req.body.title || 'The Epic Adventure',
    genre: req.body.genre,
    target_audience: req.body.targetAgeGroup,
    theme: req.body.theme,
    story_length: req.body.storyLength,
    art_style: req.body.artStyle,
    main_character: {
      name: req.body.mainCharacterName,
      gender: req.body.mainCharacterGender,
      traits: parseTraits(req.body.mainCharacterTraits)
    },
    supporting_characters: parseSupportingCharacters(req.body.supportingCharacters),
    narration_voice_id: req.body.narrationVoiceId,
    narration_tone: req.body.narrationTone
  };

  const savedStory = await saveStory(sessionId, storyData);
  const storyId = savedStory.id;

  // Generate story content
  const story = await createStory(buildStoryOptions(req.body));
  
  // Update story with generated title and content
  await updateStoryWithGeneratedContent(storyId, story.title);
  await updateStoryStatus(storyId, 'generating');

  console.log(`[pipeline] Story ${storyId}: received ${story.pages.length} scenes.`);
  console.log(`[pipeline] Story structure:`, {
    hasPages: !!story.pages,
    pagesLength: story.pages?.length,
    firstPage: story.pages?.[0] ? {
      pageNumber: story.pages[0].pageNumber,
      title: story.pages[0].title,
      hasTimeline: !!story.pages[0].timeline
    } : null
  });

  const narratorConfig = await resolveNarratorVoice({
    narrationTone: req.body.narrationTone,
    voiceSampleBase64: req.body.voiceSampleBase64,
    voiceSampleFormat: req.body.voiceSampleFormat,
    useUserVoice: req.body.useUserVoiceForNarration,
    narrationVoiceId: req.body.narrationVoiceId,
    narrationVoiceAlias: req.body.narrationVoiceAlias,
  });

  const narratorVoiceId = narratorConfig?.voiceId || process.env.ELEVENLABS_NARRATOR_VOICE_ID;

  // Save story pages to database
  for (const page of story.pages) {
    if (!page.pageNumber) {
      throw new HttpError(400, 'Page number is missing from story page');
    }
    
    await saveStoryPage(storyId, {
      pageNumber: page.pageNumber, // GPT service transforms page.page to pageNumber
      scene_title: page.title, // GPT service transforms scene_title to title
      image_prompt: page.imagePrompt, // GPT service transforms image_prompt to imagePrompt
      timeline: page.timeline
    });
  }

  // Fire-and-forget background processing
  processStory({ 
    storyId, 
    story, 
    narratorVoiceId, 
    sessionId,
    characterReferences: req.body.characterReferences 
  }).catch((error) => {
    console.error(`[pipeline] Story ${storyId}: pipeline error`, error);
  });

  res.status(202).json({ 
    storyId, 
    story: {
      ...story,
      title: story.title // GPT가 생성한 제목 포함
    }
  });
});

export const getStoryStatus = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  
  if (!storyId) {
    throw new HttpError(400, 'Story ID is required');
  }

  // Get story from database
  const story = await getStory(storyId);
  if (!story) {
    throw new HttpError(404, 'Story not found');
  }

  // Get story pages from database
  const { data: pages, error } = await supabase
    .from('story_pages')
    .select('*')
    .eq('story_id', storyId)
    .order('page_number');

  if (error) {
    console.error('[getStoryStatus] Error fetching pages:', error);
    throw new HttpError(500, 'Failed to fetch story pages');
  }

  // Transform pages for frontend
  const transformedPages = pages.map(page => ({
    pageNumber: page.page_number,
    title: page.scene_title,
    status: page.status || 'pending',
    assets: {
      image: page.image_url,
      audio: page.audio_url
    },
    timeline: page.timeline || []
  }));

  res.json({
    story: {
      title: story.title,
      logline: story.logline,
      characters: story.characters,
    },
    pages: transformedPages,
    progress: {
      completed: transformedPages.filter(p => p.status === 'completed').length,
      total: transformedPages.length
    },
    createdAt: story.created_at,
  });
});

export const getStoryPage = asyncHandler(async (req, res) => {
  const { storyId, pageNumber } = req.params;
  const state = getStoryState(storyId);
  if (!state) {
    throw new HttpError(404, 'Story not found');
  }

  const pageNum = Number(pageNumber);
  const pageState = state.pages.find((p) => p.pageNumber === pageNum);
  const pageContent = state.story.pages.find((p) => p.pageNumber === pageNum);

  if (!pageState || !pageContent) {
    throw new HttpError(404, 'Page not found');
  }

  res.json({
    pageNumber: pageNum,
    status: pageState.status,
    assets: pageState.assets,
    content: pageContent,
  });
});

export const generateNarration = asyncHandler(async (req, res) => {
  const { text, voiceId, voiceSettings } = req.body;

  if (!text) {
    throw new HttpError(400, 'Text is required for narration.');
  }

  const narration = await synthesizeSpeech({ text, voiceId, voiceSettings });
  res.status(201).json(narration);
});

export const narratePages = asyncHandler(async (req, res) => {
  const { pages, voiceId: userVoiceId, voiceAlias } = req.body;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new HttpError(400, 'pages array is required.');
  }

  const overrideVoice = voiceAlias ? resolveVoiceId(voiceAlias, 'narrator') : null;
  const fixedVoiceId = overrideVoice || userVoiceId || resolveVoiceId(process.env.ELEVENLABS_NARRATOR_VOICE_ID, 'narrator') || process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  if (!fixedVoiceId) {
    throw new HttpError(400, 'Missing narrator voice id. Provide voiceId or set ELEVENLABS_NARRATOR_VOICE_ID.');
  }

  const results = [];
  for (const page of pages) {
    const pageNumber = page.pageNumber ?? page.page ?? results.length + 1;
    
    // 나레이션 텍스트와 voice_settings 추출
    const narrationEntries = (page.timeline || [])
      .filter((entry) => entry.type === 'narration');
    
    const narrationText = narrationEntries
      .map((entry) => entry.text)
      .filter(Boolean)
      .join(' ');

    if (!narrationText) {
      results.push({ page: pageNumber, audio: null, audioUrl: null });
      continue;
    }

    // 첫 번째 나레이션 엔트리의 voice_settings 사용 (있다면)
    const voiceSettings = narrationEntries[0]?.voiceSettings || {
      stability: 0.85,
      similarity_boost: 0.8,
      style: 0.2,
      speed: 1.0
    };

    const tts = await synthesizeSpeech({ 
      text: narrationText, 
      voiceId: fixedVoiceId,
      voiceSettings 
    });
    
    // Save audio to database instead of local storage
    const audioBuffer = Buffer.from(tts.audioBase64, 'base64');
    const audioAsset = await saveAudioToDatabase('narration-story', pageNumber, audioBuffer, 'audio/mpeg');
    
    results.push({ page: pageNumber, audio: audioAsset.asset_url, audioUrl: audioAsset.asset_url });
  }

  res.status(201).json({ audios: results });
});

export const generateIllustrations = asyncHandler(async (req, res) => {
  const { prompt, pageNumber, artStyle, aspectRatio, seed } = req.body;

  if (!prompt) {
    throw new HttpError(400, 'Prompt is required to generate an illustration.');
  }

  const illustration = await generateSceneIllustration({
    prompt,
    pageNumber,
    artStyle,
    aspectRatio,
    seed,
  });

  res.status(201).json(illustration);
});

export const generateSceneImages = asyncHandler(async (req, res) => {
  console.log('🔧 Controller: Starting image generation...', { pagesCount: req.body.pages?.length, artStyle: req.body.artStyle, aspectRatio: req.body.aspectRatio });
  
  const { pages, artStyle = 'storybook', aspectRatio = '3:2', characterReferences } = req.body;
  
  if (!Array.isArray(pages) || pages.length === 0) {
    console.error('🔧 Controller: Invalid pages array');
    throw new HttpError(400, 'pages array is required.');
  }

  const imageSeed = Math.floor(Math.random() * 10_000_000);
  console.log('🔧 Controller: Generated image seed:', imageSeed);
  const results = [];

  for (const page of pages) {
    const pageNumber = page.pageNumber ?? page.page ?? results.length + 1;
    const imagePrompt = page.imagePrompt || page.image_prompt;
    
    console.log(`🔧 Controller: Processing page ${pageNumber}...`, { hasPrompt: !!imagePrompt, prompt: imagePrompt?.substring(0, 100) + '...' });

    if (!imagePrompt) {
      console.warn(`🔧 Controller: No image prompt for page ${pageNumber}`);
      results.push({ page: pageNumber, image: null, imageUrl: null });
      continue;
    }

    try {
      console.log(`🔧 Controller: Calling generateSceneIllustration for page ${pageNumber}...`);
      const illustration = await generateSceneIllustration({
        prompt: imagePrompt,
        pageNumber,
        artStyle,
        aspectRatio,
        seed: imageSeed,
        characterReferences,
      });

      console.log(`🔧 Controller: Saving image asset for page ${pageNumber}...`);
      const imageAsset = await saveBase64Asset({
        data: illustration.imageBase64,
        extension: 'png',
        directory: 'images',
        fileName: `scene-${pageNumber}.png`,
      });

      console.log(`🔧 Controller: Successfully generated image for page ${pageNumber}:`, imageAsset.publicUrl);
      results.push({ 
        page: pageNumber, 
        image: imageAsset.publicPath, 
        imageUrl: imageAsset.publicUrl 
      });
    } catch (error) {
      console.error(`🔧 Controller: Failed to generate image for page ${pageNumber}:`, error.message, error);
      results.push({ page: pageNumber, image: null, imageUrl: null });
    }
  }

  console.log('🔧 Controller: Image generation completed:', { resultsCount: results.length, results });
  res.status(201).json({ images: results });
});
export const listElevenVoices = asyncHandler(async (_req, res) => {
  const voices = await listVoices();
  res.json({ voices });
});

export const generateStoryBundle = asyncHandler(async (req, res) => {
  assertRequiredStoryFields(req.body ?? {});

  const {
    createAudio = true,
    createImages = true,
    artStyle = 'storybook',
    aspectRatio = '3:2',
    narrationTone,
    narrationVoiceId,
    voiceSampleBase64,
    voiceSampleFormat,
    useUserVoiceForNarration,
    characterReferences,
  } = req.body;

  console.log('[bundle] start', { createAudio, createImages, artStyle, aspectRatio });
  const story = await createStory(buildStoryOptions(req.body));
  console.log('[bundle] story generated', { pages: story.pages?.length ?? 0, title: story.title });
  const narratorVoice = await resolveNarratorVoice({
    narrationTone,
    voiceSampleBase64,
    voiceSampleFormat,
    useUserVoice: useUserVoiceForNarration,
    narrationVoiceId,
    narrationVoiceAlias: req.body?.narrationVoiceAlias,
  });
  console.log('[bundle] narrator voice', { voiceId: narratorVoice.voiceId });

  const characterVoiceCache = new Map();
  const imageSeed = Math.floor(Math.random() * 10_000_000);

  const pages = [];

  for (const page of story.pages) {
    console.log('[bundle] page start', { page: page.pageNumber });
    const audioSegments = [];

    if (createAudio) {
      for (const beat of page.timeline) {
        if (beat.type === 'narration') {
          console.log('[bundle] tts narration', { page: page.pageNumber });
          const segment = await synthesizeSpeech({
            text: beat.text,
            voiceId: narratorVoice.voiceId,
            voiceSettings: narratorVoice.voiceSettings,
          });

          audioSegments.push({ type: 'narration', ...segment });
        }

        if (beat.type === 'character') {
          const cacheKey = beat.name?.toLowerCase() ?? 'character';
          if (!characterVoiceCache.has(cacheKey)) {
            characterVoiceCache.set(cacheKey, resolveCharacterVoice(beat));
          }

          const voiceProfile = characterVoiceCache.get(cacheKey);
          console.log('[bundle] tts character', { page: page.pageNumber, name: beat.name, voiceId: voiceProfile.voiceId });
          const segment = await synthesizeSpeech({
            text: beat.text,
            voiceId: voiceProfile.voiceId,
            voiceSettings: voiceProfile.voiceSettings,
          });

          audioSegments.push({
            type: 'character',
            name: beat.name,
            ...segment,
          });
        }

        if (beat.type === 'sfx') {
          console.log('[bundle] sfx', { page: page.pageNumber, description: beat.description });
          const effect = await generateSoundEffect({
            description: beat.description,
            placeholder: beat.placeholder,
          });

          // SFX에 fade 효과 적용
          if (effect.audioBase64) {
            const sfxBuffer = Buffer.from(effect.audioBase64, 'base64');
            const fadedSfxBuffer = await applySFXFadeEffects(sfxBuffer, beat.description);
            const fadedSfxBase64 = fadedSfxBuffer.toString('base64');
            
            audioSegments.push({ 
              type: 'sfx', 
              ...effect,
              audioBase64: fadedSfxBase64
            });
          } else {
            audioSegments.push({ type: 'sfx', ...effect });
          }
        }
      }
    }

    const mixedAudio = createAudio
      ? await mixPageAudio({ pageNumber: page.pageNumber, segments: audioSegments })
      : null;
    
    let audioUrl = null;
    if (mixedAudio) {
      // Convert the mixed audio to buffer and save to database
      try {
        const audioResponse = await fetch(mixedAudio.publicUrl);
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        const audioAsset = await saveAudioToDatabase('bundle-story', page.pageNumber, audioBuffer, 'audio/mpeg');
        audioUrl = audioAsset.asset_url;
        console.log('[bundle] audio saved to database', { page: page.pageNumber, url: audioUrl });
      } catch (error) {
        console.error('[bundle] failed to save audio to database:', error);
        audioUrl = mixedAudio.publicUrl; // Fallback to local URL
      }
    }

    const illustration = createImages && page.imagePrompt
      ? await generateSceneIllustration({
          prompt: page.imagePrompt,
          pageNumber: page.pageNumber,
          artStyle,
          aspectRatio,
          seed: imageSeed,
          characterReferences,
        })
      : null;

    const imageAsset = illustration
      ? await saveBase64Asset({
          data: illustration.imageBase64,
          extension: 'png',
          directory: 'images',
          fileName: `page-${page.pageNumber}.png`,
        })
      : null;
    if (imageAsset) {
      console.log('[bundle] image saved', { page: page.pageNumber, path: imageAsset.publicPath });
    }

    pages.push({
      page: page.pageNumber,
      image: imageAsset?.publicPath ?? null,
      imageUrl: imageAsset?.publicUrl ?? null,
      audio: mixedAudio?.publicPath ?? null,
      audioUrl: audioUrl ?? mixedAudio?.publicUrl ?? null,
      text_md: page.timeline?.map(entry => entry.text || entry.description || '').filter(Boolean).join('\n\n') || '',
      timeline: page.timeline,
    });
  }

  console.log('[bundle] completed', { scenes: pages.length });
  res.status(201).json({
    story: {
      title: story.title,
      logline: story.logline,
      characters: story.characters,
    },
    pages,
  });
});

// Get list of available narrator voices
export const listNarratorVoices = asyncHandler(async (req, res) => {
  console.log('[narrator-voices] listing available narrator voices');
  
  // Enhanced narrator voices list with descriptions
  const narratorVoices = [
    { 
      id: 'EkK5I93UQWFDigLMpZcX', 
      name: 'James - Husky & Engaging', 
      gender: 'male',
      description: 'Deep, engaging male voice perfect for adventure stories'
    },
    { 
      id: 'ESELSAYNsoxwNZeqEklA', 
      name: 'Rebekah Nemethy - Pro Narration', 
      gender: 'female',
      description: 'Professional female narrator with clear, warm delivery'
    },
    { 
      id: 'Mu5jxyqZOLIGltFpfalg', 
      name: 'Jameson - Guided Meditation', 
      gender: 'male',
      description: 'Calm, soothing male voice ideal for peaceful stories'
    },
    { 
      id: 'iCrDUkL56s3C8sCRl7wb', 
      name: 'Hope - Soothing Narrator', 
      gender: 'female',
      description: 'Gentle, comforting female voice for emotional stories'
    },
    { 
      id: 'iUqOXhMfiOIbBejNtfLR', 
      name: 'W. Storytime Oxley', 
      gender: 'male',
      description: 'Classic storyteller voice with traditional charm'
    },
    { 
      id: 'TX3LPaxmHKxFdv7VOQHJ', 
      name: 'Liam - Young Hero', 
      gender: 'male',
      description: 'Energetic young male voice for action-packed adventures'
    },
    { 
      id: 'ZF6FPAbjXT4488VcRRnw', 
      name: 'Amelia - Brave Heroine', 
      gender: 'female',
      description: 'Confident young female voice for heroic tales'
    },
    { 
      id: 'EXAVITQu4vr4xnSDxMaL', 
      name: 'Sarah - Wise Mentor', 
      gender: 'female',
      description: 'Mature, wise female voice for guidance and wisdom'
    },
    { 
      id: '5Q0t7uMcjvnagumLfvZi', 
      name: 'Paul - Trusted Guide', 
      gender: 'male',
      description: 'Reliable, trustworthy male voice for epic journeys'
    },
    { 
      id: '2EiwWnXFnvU5JabPnv8n', 
      name: 'Clyde - Mysterious Villain', 
      gender: 'male',
      description: 'Deep, mysterious voice perfect for antagonists'
    }
  ];
  
  console.log(`[narrator-voices] Returning ${narratorVoices.length} narrator voices`);
  
  res.status(200).json({
    voices: narratorVoices,
    total: narratorVoices.length
  });
});

// 스토리 생성 취소 API
export const cancelStoryGeneration = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  
  if (!storyId) {
    throw new HttpError(400, 'Story ID is required');
  }

  console.log(`[cancel-story] Cancelling story generation for ID: ${storyId}`);

  try {
    // 스토리 상태를 cancelled로 업데이트
    await updateStoryStatus(storyId, 'cancelled', 'Story generation cancelled by user');
    
    // 스토리 상태에서 제거 (있다면)
    const storyState = getStoryState(storyId);
    if (storyState) {
      console.log(`[cancel-story] Removing story state for ID: ${storyId}`);
      // 스토리 상태 정리 로직이 있다면 여기에 추가
    }

    console.log(`[cancel-story] Successfully cancelled story generation for ID: ${storyId}`);
    res.status(200).json({ 
      message: 'Story generation cancelled successfully',
      storyId,
      status: 'cancelled'
    });
  } catch (error) {
    console.error(`[cancel-story] Failed to cancel story ${storyId}:`, error);
    throw new HttpError(500, 'Failed to cancel story generation', { error: error.message });
  }
});

// Get stories by session
export const getStoriesBySessionId = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new HttpError(400, 'Session ID is required');
  }

  const stories = await getStoriesBySession(sessionId);
  
  res.status(200).json({
    sessionId,
    stories,
    total: stories.length
  });
});

// Get all stories (for library display) with pagination
export const getAllStories = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 16;
  const offset = (page - 1) * limit;
  
  const { stories, total } = await getAllStoriesFromDB(limit, offset);
  
  res.status(200).json({
    stories,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1
  });
});

// Get story by ID
export const getStoryById = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  
  if (!storyId) {
    throw new HttpError(400, 'Story ID is required');
  }

  const story = await getStory(storyId);
  
  if (!story) {
    throw new HttpError(404, 'Story not found');
  }
  
  res.status(200).json(story);
});

// Get session statistics
export const getSessionStatistics = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new HttpError(400, 'Session ID is required');
  }

  const stats = await getSessionStats(sessionId);
  
  res.status(200).json({
    sessionId,
    ...stats
  });
});

// Get generation logs for a story
export const getStoryGenerationLogs = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  
  if (!storyId) {
    throw new HttpError(400, 'Story ID is required');
  }

  const logs = await getGenerationLogs(storyId);
  
  res.status(200).json({
    storyId,
    logs,
    total: logs.length
  });
});

// Create new session
export const createNewSession = asyncHandler(async (req, res) => {
  const sessionId = generateSessionId();
  const session = await getOrCreateSession(sessionId, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip || req.connection.remoteAddress
  });
  
  res.status(201).json({
    sessionId,
    session
  });
});
