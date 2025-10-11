export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const notFoundHandler = (req, res, next) => {
  const message = `Route not found: ${req.method} ${req.originalUrl}`;
  next(new HttpError(404, message, { 
    method: req.method, 
    url: req.originalUrl,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'POST /api/story/generate',
      'POST /api/story/build',
      'GET /api/story/stories',
      'GET /api/story/:storyId/status',
      'GET /api/story/:storyId',
      'GET /api/story/narrator-voices'
    ]
  }));
};

export const errorHandler = (error, req, res, next) => {
  const status = error.status || 500;
  const payload = {
    message: error.message || 'Unexpected error',
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (process.env.NODE_ENV !== 'production' && error.stack) {
    payload.stack = error.stack;
  }

  res.status(status).json(payload);
};
