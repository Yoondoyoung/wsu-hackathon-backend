# Supabase Setup Guide

## 1. Create Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. Note down your project URL and anon key

## 2. Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_NARRATOR_VOICE_ID=EkK5I93UQWFDigLMpZcX

# Runware Configuration
RUNWARE_API_KEY=your_runware_api_key_here

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Feature Flags
ENABLE_AUDIO=true
ENABLE_IMAGES=true
ENABLE_BUNDLE=true
ENABLE_ELEVEN_ENDPOINTS=true

# Server Configuration
PORT=4000
NODE_ENV=development
```

## 3. Database Setup

Run the SQL schema in your Supabase SQL editor:

```sql
-- Copy and paste the contents of database/schema.sql
```

## 4. Install Dependencies

```bash
npm install
```

## 5. Test Connection

```bash
node -e "
import('./src/config/supabase.js').then(async ({ testSupabaseConnection }) => {
  await testSupabaseConnection();
  process.exit(0);
});
"
```

## 6. API Endpoints

### Session Management
- `POST /api/story/session` - Create new session
- `GET /api/story/session/:sessionId/stories` - Get stories by session
- `GET /api/story/session/:sessionId/stats` - Get session statistics

### Story Management
- `POST /api/story/build` - Create story (requires X-Session-ID header)
- `GET /api/story/story/:storyId` - Get story by ID
- `GET /api/story/story/:storyId/logs` - Get generation logs

## 7. Frontend Integration

Update your frontend to include session management:

```javascript
// Generate or retrieve session ID
const sessionId = localStorage.getItem('sessionId') || generateSessionId();
localStorage.setItem('sessionId', sessionId);

// Include session ID in requests
const response = await fetch('/api/story/build', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId
  },
  body: JSON.stringify(storyData)
});
```
