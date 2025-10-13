import axios from 'axios';
import FormData from 'form-data';
import { HttpError } from '../utils/errorHandlers.js';

// Request queue and concurrency control
let requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 2; // Keep it under ElevenLabs limit of 3
const RETRY_DELAY = 2000; // 2 seconds
const MAX_RETRIES = 3;

const ELEVEN_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVEN_SFX_URL = 'https://api.elevenlabs.io/v1/sound-generation';
const ELEVEN_VOICE_CLONE_URL = 'https://api.elevenlabs.io/v1/voices/add';
const ELEVEN_LIST_VOICES_URL = 'https://api.elevenlabs.io/v1/voices';

const requireApiKey = () => {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('[elevenlabs] ELEVENLABS_API_KEY is not configured');
    throw new HttpError(500, 'ELEVENLABS_API_KEY is not configured.');
  }
  console.log(`[elevenlabs] API key is configured (length: ${process.env.ELEVENLABS_API_KEY.length})`);
};

// Request queue management
const processQueue = async () => {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return;
  }

  const request = requestQueue.shift();
  activeRequests++;

  try {
    const result = await request.fn();
    request.resolve(result);
  } catch (error) {
    request.reject(error);
  } finally {
    activeRequests--;
    // Process next request in queue
    setTimeout(processQueue, 100);
  }
};

const queueRequest = (fn) => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
};

// Retry logic for rate limiting
const withRetry = async (fn, retries = MAX_RETRIES) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        console.log(`[elevenlabs] Rate limited, retrying in ${RETRY_DELAY}ms... (attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
};

const defaultVoiceSettings = {
  stability: 0.4,
  similarity_boost: 0.85,
  style: 0.2,
};

export const synthesizeSpeech = async ({
  text,
  voiceId = 'Rachel',
  voiceSettings,
  modelId = 'eleven_multilingual_v2',
  outputFormat = 'mp3_44100_128',
}) => {
  requireApiKey();

  if (!text) {
    throw new HttpError(400, 'Missing text for speech synthesis.');
  }

  const makeRequest = async () => {
    const response = await axios.post(
      `${ELEVEN_TTS_URL}/${voiceId}`,
      {
        text,
        model_id: modelId,
        voice_settings: voiceSettings || defaultVoiceSettings,
        output_format: outputFormat,
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    const audioBase64 = Buffer.from(response.data, 'binary').toString('base64');

    return {
      voiceId,
      mimeType: 'audio/mpeg',
      audioBase64,
      meta: {
        length: Number(response.headers['content-length'] ?? 0),
      },
    };
  };

  try {
    return await queueRequest(() => withRetry(makeRequest));
  } catch (error) {
    if (error.response) {
      console.error('[elevenlabs][tts] error', {
        status: error.response.status,
        data: error.response.data,
        voiceId,
      });
      const status = error.response.status;
      const hint = status === 404
        ? 'Voice not found. Verify voice_id in your ElevenLabs account or use a cloned voice.'
        : undefined;
      throw new HttpError(status, 'ElevenLabs API error', {
        ...error.response.data,
        hint,
      });
    }

    console.error('[elevenlabs][tts] network/error', { message: error.message, voiceId });
    throw new HttpError(500, 'Failed to synthesize speech with ElevenLabs.', {
      message: error.message,
    });
  }
};

export const generateSoundEffect = async ({ description, placeholder }) => {
  requireApiKey();

  if (!description) {
    throw new HttpError(400, 'Sound effect description is required.');
  }

  console.log(`[elevenlabs][sfx] Starting SFX generation for: "${description}"`);

  // SFX 타입에 따라 다른 설정 적용 - 더 세밀한 지속시간 조정
  const getSFXSettings = (desc) => {
    const lowerDesc = desc.toLowerCase();
    
    // 매우 짧은 효과음 (1-2초) - 급작스러운 소리
    if (lowerDesc.includes('click') || lowerDesc.includes('snap') || lowerDesc.includes('pop') ||
        lowerDesc.includes('beep') || lowerDesc.includes('ding') || lowerDesc.includes('tick') ||
        lowerDesc.includes('tap') || lowerDesc.includes('knock')) {
      return { prompt_influence: 0.7, duration_seconds: 1.5 };
    }
    
    // 짧은 효과음 (2-3초) - 액션/충돌음
    if (lowerDesc.includes('crash') || lowerDesc.includes('bang') || lowerDesc.includes('explosion') ||
        lowerDesc.includes('crack') || lowerDesc.includes('slam') || lowerDesc.includes('thud') ||
        lowerDesc.includes('splash') || lowerDesc.includes('whoosh') || lowerDesc.includes('swish')) {
      return { prompt_influence: 0.8, duration_seconds: 2.5 };
    }
    
    // 중간 효과음 (3-4초) - 발소리/움직임
    if (lowerDesc.includes('footstep') || lowerDesc.includes('walk') || lowerDesc.includes('run') ||
        lowerDesc.includes('rustle') || lowerDesc.includes('move') || lowerDesc.includes('creak') ||
        lowerDesc.includes('door') || lowerDesc.includes('gate') || lowerDesc.includes('hinge')) {
      return { prompt_influence: 0.5, duration_seconds: 3.5 };
    }
    
    // 대화/소음 (2-3초) - 짧은 지속시간
    if (lowerDesc.includes('laugh') || lowerDesc.includes('whisper') || lowerDesc.includes('murmur') ||
        lowerDesc.includes('chatter') || lowerDesc.includes('voice') || lowerDesc.includes('giggle') ||
        lowerDesc.includes('sigh') || lowerDesc.includes('gasp') || lowerDesc.includes('cough')) {
      return { prompt_influence: 0.6, duration_seconds: 2.5 };
    }
    
    // 중간-긴 효과음 (4-6초) - 자연음/기계음
    if (lowerDesc.includes('thunder') || lowerDesc.includes('engine') || lowerDesc.includes('motor') ||
        lowerDesc.includes('bell') || lowerDesc.includes('alarm') || lowerDesc.includes('siren') ||
        lowerDesc.includes('horn') || lowerDesc.includes('whistle')) {
      return { prompt_influence: 0.6, duration_seconds: 5 };
    }
    
    // 환경음 (긴 지속시간, 낮은 영향도) - 6-8초
    if (lowerDesc.includes('wind') || lowerDesc.includes('rain') || lowerDesc.includes('forest') || 
        lowerDesc.includes('ambient') || lowerDesc.includes('atmosphere') || lowerDesc.includes('ocean') ||
        lowerDesc.includes('waves') || lowerDesc.includes('birds') || lowerDesc.includes('crickets')) {
      return { prompt_influence: 0.3, duration_seconds: 6 };
    }
    
    // 기본 설정 (중간값) - 3초로 단축
    return { prompt_influence: 0.5, duration_seconds: 3 };
  };

  const settings = getSFXSettings(description);
  console.log(`[elevenlabs][sfx] SFX settings for "${description}":`, settings);
  
  // 효과음 생성을 위한 상세한 프롬프트 생성
  const generateDetailedSFXPrompt = (desc) => {
    const lowerDesc = desc.toLowerCase();
    
    // 환경음 프롬프트
    if (lowerDesc.includes('wind') || lowerDesc.includes('rain') || lowerDesc.includes('forest') || 
        lowerDesc.includes('ambient') || lowerDesc.includes('atmosphere')) {
      return `Create immersive ambient sound: ${desc}. Include subtle layers of natural elements, gentle transitions, and atmospheric depth. The sound should feel organic and enveloping, perfect for background atmosphere.`;
    }
    
    // 액션/충돌음 프롬프트
    if (lowerDesc.includes('crash') || lowerDesc.includes('bang') || lowerDesc.includes('explosion') ||
        lowerDesc.includes('crack') || lowerDesc.includes('slam') || lowerDesc.includes('thud')) {
      return `Create impactful action sound: ${desc}. Include sharp attack, resonant decay, and dramatic impact. The sound should be punchy and attention-grabbing, with clear definition and powerful presence.`;
    }
    
    // 발소리/움직임 프롬프트
    if (lowerDesc.includes('footstep') || lowerDesc.includes('walk') || lowerDesc.includes('run') ||
        lowerDesc.includes('rustle') || lowerDesc.includes('move') || lowerDesc.includes('creak')) {
      return `Create realistic movement sound: ${desc}. Include natural rhythm, surface texture, and spatial positioning. The sound should feel authentic and grounded, with clear material characteristics.`;
    }
    
    // 대화/소음 프롬프트
    if (lowerDesc.includes('laugh') || lowerDesc.includes('whisper') || lowerDesc.includes('murmur') ||
        lowerDesc.includes('chatter') || lowerDesc.includes('voice') || lowerDesc.includes('giggle')) {
      return `Create human vocal sound: ${desc}. Include natural pitch variation, emotional expression, and realistic vocal characteristics. The sound should feel human and expressive, with appropriate emotional tone.`;
    }
    
    // 자연음 프롬프트
    if (lowerDesc.includes('thunder') || lowerDesc.includes('ocean') || lowerDesc.includes('waves') ||
        lowerDesc.includes('birds') || lowerDesc.includes('crickets') || lowerDesc.includes('wind')) {
      return `Create natural environmental sound: ${desc}. Include organic textures, natural rhythms, and environmental authenticity. The sound should feel alive and natural, with realistic environmental characteristics.`;
    }
    
    // 기계음 프롬프트
    if (lowerDesc.includes('engine') || lowerDesc.includes('motor') || lowerDesc.includes('bell') ||
        lowerDesc.includes('alarm') || lowerDesc.includes('siren') || lowerDesc.includes('horn')) {
      return `Create mechanical/electronic sound: ${desc}. Include precise timing, clear frequency content, and mechanical authenticity. The sound should feel engineered and purposeful, with clear technical characteristics.`;
    }
    
    // 기본 프롬프트
    return `Create clear, well-defined sound effect: ${desc}. Include appropriate attack, sustain, and decay characteristics. The sound should be crisp and recognizable, with good definition and appropriate impact.`;
  };
  
  const detailedPrompt = generateDetailedSFXPrompt(description);
  console.log(`[elevenlabs][sfx] Generated detailed prompt: "${detailedPrompt}"`);
  
  const makeRequest = async () => {
    const response = await axios.post(
      ELEVEN_SFX_URL,
      {
        text: detailedPrompt,
        prompt_influence: settings.prompt_influence,
        duration_seconds: settings.duration_seconds,
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );
    console.log('[elevenlabs][sfx] response', { 
      description: description.slice(0, 50), 
      settings,
      response: { status: response.status, dataLength: response.data.length }
    });
    
    const audioBase64 = Buffer.from(response.data, 'binary').toString('base64');
    console.log(`[elevenlabs][sfx] Successfully generated SFX for "${description}", base64 length: ${audioBase64.length}`);
    
    return {
      mimeType: 'audio/mpeg',
      audioBase64,
    };
  };

  try {
    return await queueRequest(() => withRetry(makeRequest));
  } catch (error) {
    if (error.response) {
      console.error('[elevenlabs][sfx] API error', {
        status: error.response.status,
        data: error.response.data,
        description,
      });
      throw new HttpError(error.response.status, 'ElevenLabs SFX API error', error.response.data);
    }

    console.error('[elevenlabs][sfx] network/error', { 
      message: error.message, 
      description,
      error: error 
    });
    throw new HttpError(500, 'Failed to generate sound effect with ElevenLabs.', {
      message: error.message,
      description,
    });
  }
};

export const cloneVoiceFromSample = async ({ sampleBase64, sampleFormat = 'mp3', name = 'Cloned Voice' }) => {
  requireApiKey();

  if (!sampleBase64) {
    throw new HttpError(400, 'Voice sample is required for cloning.');
  }

  const form = new FormData();
  form.append('name', name);
  form.append('files', Buffer.from(sampleBase64, 'base64'), {
    filename: `sample.${sampleFormat}`,
    contentType: `audio/${sampleFormat}`,
  });

  try {
    const response = await axios.post(ELEVEN_VOICE_CLONE_URL, form, {
      headers: {
        ...form.getHeaders(),
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
    });

    return {
      voiceId: response.data?.voice_id,
      name: response.data?.name,
    };
  } catch (error) {
    if (error.response) {
      console.error('[elevenlabs][clone] error', {
        status: error.response.status,
        data: error.response.data,
      });
      throw new HttpError(error.response.status, 'ElevenLabs voice cloning error', error.response.data);
    }

    console.error('[elevenlabs][clone] network/error', { message: error.message });
    throw new HttpError(500, 'Failed to clone voice with ElevenLabs.', {
      message: error.message,
    });
  }
};

export const listVoices = async () => {
  requireApiKey();

  try {
    const { data } = await axios.get(ELEVEN_LIST_VOICES_URL, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });
    const voices = Array.isArray(data?.voices)
      ? data.voices.map((v) => ({ voice_id: v.voice_id, name: v.name }))
      : [];
    return voices;
  } catch (error) {
    if (error.response) {
      console.error('[elevenlabs][voices] error', {
        status: error.response.status,
        data: error.response.data,
      });
      throw new HttpError(error.response.status, 'Failed to list ElevenLabs voices', error.response.data);
    }
    throw new HttpError(500, 'Failed to list ElevenLabs voices', { message: error.message });
  }
};
