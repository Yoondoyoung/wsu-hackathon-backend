import { randomUUID } from 'crypto';

const stories = new Map();

export const createStoryState = ({ story }) => {
  const storyId = randomUUID();
  stories.set(storyId, {
    story,
    createdAt: new Date().toISOString(),
    pages: story.pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: 'pending',
      assets: {},
      logs: [],
      errors: [],
    })),
    referenceImage: null,
    progress: 0,
  });
  return storyId;
};

export const getStoryState = (storyId) => stories.get(storyId) || null;

export const updatePageState = (storyId, pageNumber, updates) => {
  const state = stories.get(storyId);
  if (!state) return;
  const page = state.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) return;
  Object.assign(page, updates);
  stories.set(storyId, state);
};

const mutatePage = (storyId, pageNumber, mutator) => {
  const state = stories.get(storyId);
  if (!state) return;
  const page = state.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) return;
  mutator(page);
  stories.set(storyId, state);
};

export const setPageStatus = (storyId, pageNumber, status) => {
  mutatePage(storyId, pageNumber, (page) => {
    page.status = status;
  });
};

export const appendPageLog = (storyId, pageNumber, message) => {
  mutatePage(storyId, pageNumber, (page) => {
    page.logs = page.logs || [];
    page.logs.push({
      timestamp: new Date().toISOString(),
      message,
    });
  });
};

export const recordPageError = (storyId, pageNumber, { message, step }) => {
  mutatePage(storyId, pageNumber, (page) => {
    page.errors = page.errors || [];
    page.errors.push({
      timestamp: new Date().toISOString(),
      message,
      step,
    });
    page.status = 'failed';
  });
};

export const setPageAssets = (storyId, pageNumber, assets) => {
  mutatePage(storyId, pageNumber, (page) => {
    page.assets = {
      ...(page.assets || {}),
      ...assets,
    };
  });
};

export const setReferenceImage = (storyId, imageBase64) => {
  const state = stories.get(storyId);
  if (!state) return;
  state.referenceImage = imageBase64;
  stories.set(storyId, state);
};

export const getReferenceImage = (storyId) => {
  const state = stories.get(storyId);
  return state?.referenceImage || null;
};

export const updateProgress = (storyId, completedPages) => {
  const state = stories.get(storyId);
  if (!state) return;
  const total = state.pages.length || 1;
  state.progress = Math.min(1, completedPages / total);
  stories.set(storyId, state);
};

export const listStories = () => Array.from(stories.entries()).map(([id, value]) => ({ id, ...value }));
