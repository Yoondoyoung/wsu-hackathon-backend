import { resolveVoiceId } from '../config/voiceMap.js';

const fallbackNarrator = {
  voiceId: resolveVoiceId(process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'rachel', 'narrator') || 'rachel',
  voiceSettings: {
    stability: 0.45,
    similarity_boost: 0.85,
    style: 0.15,
  },
};

const narrationVoiceMap = [
  {
    match: /deep|dramatic|male/i,
    voiceId: 'antoni',
    voiceSettings: {
      stability: 0.4,
      similarity_boost: 0.9,
      style: 0.25,
    },
  },
  {
    match: /calm|soothing|female|gentle/i,
    voiceId: 'rachel',
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.85,
      style: 0.1,
    },
  },
  {
    match: /energetic|excited|upbeat/i,
    voiceId: 'sam',
    voiceSettings: {
      stability: 0.3,
      similarity_boost: 0.8,
      style: 0.5,
    },
  },
  {
    match: /warm|storyteller|motherly/i,
    voiceId: 'bella',
    voiceSettings: {
      stability: 0.55,
      similarity_boost: 0.88,
      style: 0.2,
    },
  },
];

const characterTraitVoiceMap = [
  { traits: ['brave', 'leader', 'hero'], voiceId: 'adam' },
  { traits: ['curious', 'playful', 'mischievous'], voiceId: 'sam' },
  { traits: ['wise', 'mentor', 'guardian'], voiceId: 'antoni' },
  { traits: ['kind', 'gentle', 'friend'], voiceId: 'bella' },
  { traits: ['mysterious', 'villain', 'shadow'], voiceId: 'domi' },
];

export const matchNarrationVoice = (tone) => {
  if (!tone) {
    return {
      ...fallbackNarrator,
      voiceId: resolveVoiceId(fallbackNarrator.voiceId, 'narrator') || fallbackNarrator.voiceId,
    };
  }

  const candidate = narrationVoiceMap.find(({ match }) => match.test(tone));
  if (!candidate) return fallbackNarrator;
  return {
    voiceId: resolveVoiceId(candidate.voiceId, 'narrator') || fallbackNarrator.voiceId,
    voiceSettings: fallbackNarrator.voiceSettings,
  };
};

export const matchCharacterVoice = (traits = []) => {
  if (!Array.isArray(traits) || traits.length === 0) {
    return resolveVoiceId('sam', 'characters') || 'sam';
  }

  const lowerTraits = traits.map((trait) => trait.toLowerCase());

  for (const mapping of characterTraitVoiceMap) {
    if (mapping.traits.some((trait) => lowerTraits.includes(trait))) {
      return resolveVoiceId(mapping.voiceId, 'characters') || mapping.voiceId;
    }
  }

  return resolveVoiceId('sam', 'characters') || 'sam';
};

export const defaultCharacterVoiceSettings = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.2,
};
