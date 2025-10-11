import { Router } from 'express';
import {
  generateStory,
  generateNarration,
  generateIllustrations,
  generateSceneImages,
  generateStoryBundle,
  listElevenVoices,
  listNarratorVoices,
  narratePages,
  buildStoryPipeline,
  getStoryStatus,
  getStoryPage,
  getStoriesBySessionId,
  getAllStories,
  getStoryById,
  getSessionStatistics,
  getStoryGenerationLogs,
  createNewSession,
} from '../controllers/storyController.js';
import {
  ENABLE_AUDIO,
  ENABLE_IMAGES,
  ENABLE_BUNDLE,
  ENABLE_ELEVEN_ENDPOINTS,
  disabledHandler,
} from '../utils/features.js';

const router = Router();


// Session management
router.post('/session', createNewSession);
router.get('/session/:sessionId/stories', getStoriesBySessionId);
router.get('/session/:sessionId/stats', getSessionStatistics);

// Story management
router.get('/stories', getAllStories);
router.post('/generate', generateStory);
router.post('/build', buildStoryPipeline);

// Legacy endpoints (must come before parameterized routes)
router.post('/narrate', ENABLE_AUDIO && ENABLE_ELEVEN_ENDPOINTS ? generateNarration : disabledHandler('Narration'));
router.post('/illustrate', ENABLE_IMAGES ? generateIllustrations : disabledHandler('Illustration'));
router.post('/generate-images', ENABLE_IMAGES ? generateSceneImages : disabledHandler('Generate Images'));
router.post('/bundle', ENABLE_BUNDLE ? generateStoryBundle : disabledHandler('Bundle'));
router.get('/voices', ENABLE_ELEVEN_ENDPOINTS ? listElevenVoices : disabledHandler('Voices'));
router.get('/narrator-voices', listNarratorVoices);
router.post('/narrate-pages', ENABLE_AUDIO && ENABLE_ELEVEN_ENDPOINTS ? narratePages : disabledHandler('Narrate pages'));

// Parameterized routes (must come after specific routes)
router.get('/:storyId/status', getStoryStatus);
router.get('/:storyId/logs', getStoryGenerationLogs);
router.get('/:storyId/page/:pageNumber', getStoryPage);
router.get('/:storyId', getStoryById);

export default router;
