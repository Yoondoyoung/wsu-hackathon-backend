import axios from 'axios';
import { synthesizeSpeech, generateSoundEffect } from '../services/elevenLabsService.js';
import { generateSceneIllustration } from '../services/runwareService.js';
import { mixSequentialAudio, mixAudioWithSFX, applySFXFadeEffects } from '../services/audioMixerService.js';
import { saveBase64Asset } from '../utils/storage.js';
import { saveAudioToDatabase, updateStoryPage } from '../services/storyStorageService.js';
import {
  setReferenceImage,
  getReferenceImage,
  updateProgress,
  setPageStatus,
  appendPageLog,
  recordPageError,
  setPageAssets,
} from '../state/storyState.js';
import { ENABLE_AUDIO, ENABLE_IMAGES, ENABLE_ELEVEN_ENDPOINTS } from '../utils/features.js';
import { resolveVoiceId } from '../config/voiceMap.js';
import { matchCharacterVoice, defaultCharacterVoiceSettings } from '../utils/voiceLibrary.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pickNarrationVoice = (beat, fallbackId) => {
  if (beat?.voiceId) return beat.voiceId;
  if (beat?.voice) {
    const resolved = resolveVoiceId(beat.voice, 'narrator');
    if (resolved) return resolved;
  }
  return fallbackId || resolveVoiceId(process.env.ELEVENLABS_NARRATOR_VOICE_ID, 'narrator') || process.env.ELEVENLABS_NARRATOR_VOICE_ID;
};

const pickCharacterVoice = (beat) => {
  if (beat?.voiceId) return beat.voiceId;
  if (beat?.voice) {
    const resolved = resolveVoiceId(beat.voice, 'characters');
    if (resolved) return resolved;
  }
  if (beat?.traits) {
    const resolved = matchCharacterVoice(beat.traits);
    if (resolved) return resolved;
  }
  return resolveVoiceId('sam', 'characters') || matchCharacterVoice([]);
};

const synthesizeLine = async ({ text, voiceId, voiceSettings }) => {
  if (!text || !voiceId) return null;
  const response = await synthesizeSpeech({
    text,
    voiceId,
    voiceSettings: voiceSettings ?? defaultCharacterVoiceSettings,
  });
  return {
    buffer: Buffer.from(response.audioBase64, 'base64'),
    base64: response.audioBase64,
    voiceId,
  };
};

const generateSound = async ({ description }) => {
  if (!description) return null;
  
  try {
    const response = await generateSoundEffect({ description, placeholder: description.slice(0, 20) });
    return {
      buffer: Buffer.from(response.audioBase64, 'base64'),
      base64: response.audioBase64,
    };
  } catch (error) {
    console.warn(`[pipeline] SFX generation failed for "${description}":`, error.message);
    return null; // SFX 실패 시 null 반환하여 오디오 파이프라인 계속 진행
  }
};

const generateIllustration = async ({ storyId, page, prompt, characterReferences }) => {
  if (!ENABLE_IMAGES || !prompt) return null;
  
  const illustration = await generateSceneIllustration({
    prompt,
    pageNumber: page,
    characterReferences,
    storyId,
  });

  // Set reference image for character consistency (first image only)
  if (!getReferenceImage(storyId) && illustration?.imageURL) {
    // For reference images, we still need to download and store base64
    // This is a limitation of the current reference image system
    try {
      const imageResponse = await axios.get(illustration.imageURL, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      setReferenceImage(storyId, imageBase64);
    } catch (error) {
      console.warn(`[pipeline] Failed to download reference image for story ${storyId}:`, error.message);
    }
  }

  // Return URL directly instead of saving to local storage
  return {
    publicUrl: illustration.imageURL,
    publicPath: illustration.imageURL, // Use URL as path for consistency
    filePath: null, // No local file
  };
};

export const processScene = async ({ storyId, page, timeline, imagePrompt, narratorVoiceId, characterReferences }) => {
  setPageStatus(storyId, page, 'processing');
  appendPageLog(storyId, page, `Setting the stage for scene ${page}...`);
  console.log(`[pipeline] Scene ${page}: starting processing.`);

  let hasError = false;
  let illustration = null;
  const audioBuffers = [];
  let finalAudio = null;

  if (ENABLE_AUDIO && ENABLE_ELEVEN_ENDPOINTS) {
    for (const beat of timeline || []) {
      const type = (beat.type || '').toLowerCase();
      try {
        if (type === 'narration') {
          appendPageLog(storyId, page, 'Narrator steps into the spotlight.');
          const voiceId = pickNarrationVoice(beat, narratorVoiceId);
          if (!voiceId) {
            appendPageLog(storyId, page, 'No narrator voice configured; skipping narration line.');
            continue;
          }
          const line = await synthesizeLine({ text: beat.text, voiceId });
          if (line) {
            audioBuffers.push(line.buffer);
            appendPageLog(storyId, page, 'Narration line captured.');
          }
        } else if (type === 'character') {
          appendPageLog(storyId, page, `${beat.name || 'Character'} delivers a line.`);
          const voiceId = pickCharacterVoice(beat);
          const line = await synthesizeLine({ text: beat.text, voiceId });
          if (line) {
            audioBuffers.push(line.buffer);
            appendPageLog(storyId, page, `${beat.name || 'Character'} line recorded.`);
          }
        } else if (type === 'sfx') {
          const description = beat.description || beat.text;
          if (!description) {
            appendPageLog(storyId, page, 'Empty sound effect skipped.');
            continue;
          }
          appendPageLog(storyId, page, `Generating sound effect: ${description}.`);
          try {
            const fx = await generateSound({ description });
            if (fx) {
              // SFX에 fade 효과 적용
              const fadedFx = await applySFXFadeEffects(fx.buffer, description);
              audioBuffers.push(fadedFx);
              appendPageLog(storyId, page, 'Sound effect ready with fade effects.');
            } else {
              appendPageLog(storyId, page, 'Sound effect generation returned null - skipping.');
            }
          } catch (sfxError) {
            appendPageLog(storyId, page, `Sound effect generation failed: ${sfxError.message} - continuing without SFX.`);
            console.warn(`[pipeline] Scene ${page}: SFX generation failed, continuing without SFX:`, sfxError.message);
            // SFX 실패해도 계속 진행
          }
        }
      } catch (error) {
        hasError = true;
        const step = type === 'sfx' ? 'sound_effects' : type || 'audio';
        recordPageError(storyId, page, { step, message: error.message });
        appendPageLog(storyId, page, `Audio step failed: ${error.message}`);
        console.error(`[pipeline] Scene ${page}: failed to process ${type} beat`, error);
      }
    }
  } else {
    appendPageLog(storyId, page, 'Audio pipeline disabled - skipping narration, dialogue, and SFX.');
    console.log(`[pipeline] Scene ${page}: audio pipeline disabled.`);
  }

  if (audioBuffers.length > 0) {
    try {
      appendPageLog(storyId, page, 'Stitching narration, dialogue, and sound effects in sequence.');
      const mixedBuffer = await mixSequentialAudio(audioBuffers);
      if (mixedBuffer) {
        // Save audio to database instead of local storage
        const audioAsset = await saveAudioToDatabase(storyId, page, mixedBuffer, 'audio/mpeg');
        finalAudio = {
          publicUrl: audioAsset.asset_url,
          publicPath: audioAsset.asset_url,
          filePath: null, // No local file
        };
        // Save audio URL to database
        await updateStoryPage(storyId, page, { audio_url: finalAudio.publicUrl });
        setPageAssets(storyId, page, { audio: finalAudio.publicUrl });
        appendPageLog(storyId, page, 'Sequential audio mix complete and saved to database.');
        console.log(`[pipeline] Scene ${page}: audio mix saved to database.`);
      }
    } catch (error) {
      hasError = true;
      recordPageError(storyId, page, { step: 'mixing', message: error.message });
      appendPageLog(storyId, page, 'Audio mixing stumbled.');
      console.error(`[pipeline] Mixing failed for scene ${page}`, error);
    }
  } else {
    appendPageLog(storyId, page, 'No audio generated for this scene.');
  }

  try {
    if (ENABLE_IMAGES && imagePrompt) {
      appendPageLog(storyId, page, 'Painting the illustration...');
      console.log(`[pipeline] Scene ${page}: requesting illustration.`);
      illustration = await generateIllustration({ storyId, page, prompt: imagePrompt, characterReferences });
      if (illustration) {
        // Save image URL to database
        await updateStoryPage(storyId, page, { image_url: illustration.publicUrl });
        setPageAssets(storyId, page, { image: illustration.publicUrl });
        appendPageLog(storyId, page, 'Illustration complete.');
        console.log(`[pipeline] Scene ${page}: illustration ready and saved to database.`);
      }
    } else if (!imagePrompt) {
      appendPageLog(storyId, page, 'No image prompt provided; skipping illustration.');
      console.log(`[pipeline] Scene ${page}: no image prompt provided.`);
    } else {
      appendPageLog(storyId, page, 'Image pipeline disabled; skipping illustration.');
      console.log(`[pipeline] Scene ${page}: image pipeline disabled.`);
    }
  } catch (error) {
    hasError = true;
    appendPageLog(storyId, page, 'Illustration failed.');
    recordPageError(storyId, page, { step: 'illustration', message: error.message });
    console.error(`[pipeline] Illustration failed for scene ${page}`, error);
  }

  if (!hasError) {
    appendPageLog(storyId, page, 'Scene ready for showtime.');
    setPageStatus(storyId, page, 'completed');
    console.log(`[pipeline] Scene ${page}: completed.`);
  } else {
    console.warn(`[pipeline] Scene ${page}: completed with issues.`);
  }
};

export const processStory = async ({ storyId, story, narratorVoiceId, characterReferences }) => {
  let completed = 0;
  const totalPages = story.pages.length;
  console.log(`[pipeline] Story ${storyId}: processing ${totalPages} scenes.`);
  
  // Promise 배열을 저장하여 모든 페이지 완료를 추적
  const pagePromises = [];
  
  for (let i = 0; i < totalPages; i += 1) {
    const page = story.pages[i];
    const prompt = page.imagePrompt || page.image_prompt;
    
    if (i === 0) {
      console.log(`[pipeline] Story ${storyId}: running scene ${page.pageNumber} immediately.`);
      const firstPagePromise = processScene({
        storyId,
        page: page.pageNumber,
        timeline: page.timeline,
        imagePrompt: prompt,
        narratorVoiceId,
        characterReferences,
      }).then(() => {
        completed += 1;
        updateProgress(storyId, completed);
        console.log(`[pipeline] Story ${storyId}: scene ${page.pageNumber} finished (${completed}/${totalPages}).`);
      });
      pagePromises.push(firstPagePromise);
    } else {
      console.log(`[pipeline] Story ${storyId}: scheduling scene ${page.pageNumber} in background.`);
      const backgroundPagePromise = sleep(i * 500)
        .then(async () => {
          await processScene({
            storyId,
            page: page.pageNumber,
            timeline: page.timeline,
            imagePrompt: prompt,
            narratorVoiceId,
            characterReferences,
          });
          completed += 1;
          updateProgress(storyId, completed);
          console.log(`[pipeline] Story ${storyId}: scene ${page.pageNumber} finished (${completed}/${totalPages}).`);
        })
        .catch((error) => {
          console.error(`[pipeline] Story ${storyId}: background scene ${page.pageNumber} crashed`, error);
        });
      pagePromises.push(backgroundPagePromise);
    }
  }
  
  // 모든 페이지 처리가 완료될 때까지 대기
  try {
    await Promise.all(pagePromises);
    console.log(`[pipeline] Story ${storyId}: All ${totalPages} scenes completed successfully.`);
    
    // 스토리 상태를 completed로 업데이트
    const { updateStoryStatus } = await import('../services/storyStorageService.js');
    await updateStoryStatus(storyId, 'completed');
    console.log(`[pipeline] Story ${storyId}: Status updated to completed.`);
    
  } catch (error) {
    console.error(`[pipeline] Story ${storyId}: Some scenes failed to process`, error);
    
    // 일부 실패 시에도 상태 업데이트 (선택사항)
    const { updateStoryStatus } = await import('../services/storyStorageService.js');
    await updateStoryStatus(storyId, 'failed');
    console.log(`[pipeline] Story ${storyId}: Status updated to failed.`);
  }
};
