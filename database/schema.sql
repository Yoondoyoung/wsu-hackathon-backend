-- Supabase Database Schema for Storybook Application
-- This schema supports session-based story storage

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table - stores user sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET,
  is_active BOOLEAN DEFAULT true
);

-- Stories table - stores story metadata
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  genre VARCHAR(100),
  target_audience VARCHAR(100),
  theme TEXT,
  story_length INTEGER DEFAULT 4,
  art_style VARCHAR(100),
  main_character JSONB,
  supporting_characters JSONB,
  narration_voice_id VARCHAR(100),
  narration_tone VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'generating', -- generating, completed, failed
  error_message TEXT
);

-- Story pages table - stores individual story pages
CREATE TABLE IF NOT EXISTS story_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  scene_title VARCHAR(500),
  image_prompt TEXT,
  image_url TEXT,
  audio_url TEXT,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(story_id, page_number)
);

-- Story generation logs table - stores generation progress and logs
CREATE TABLE IF NOT EXISTS story_generation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_number INTEGER,
  log_type VARCHAR(50) NOT NULL, -- info, warning, error, success
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Story assets table - stores generated assets (audio, images)
CREATE TABLE IF NOT EXISTS story_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_number INTEGER,
  asset_type VARCHAR(50) NOT NULL, -- audio, image, sfx
  asset_url TEXT NOT NULL,
  file_path TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_stories_session_id ON stories(session_id);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_story_pages_story_id ON story_pages(story_id);
CREATE INDEX IF NOT EXISTS idx_story_pages_page_number ON story_pages(page_number);
CREATE INDEX IF NOT EXISTS idx_story_generation_logs_story_id ON story_generation_logs(story_id);
CREATE INDEX IF NOT EXISTS idx_story_generation_logs_created_at ON story_generation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_story_assets_story_id ON story_assets(story_id);
CREATE INDEX IF NOT EXISTS idx_story_assets_asset_type ON story_assets(asset_type);

-- Row Level Security (RLS) policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations for now (can be restricted later)
CREATE POLICY "Allow all operations on sessions" ON sessions FOR ALL USING (true);
CREATE POLICY "Allow all operations on stories" ON stories FOR ALL USING (true);
CREATE POLICY "Allow all operations on story_pages" ON story_pages FOR ALL USING (true);
CREATE POLICY "Allow all operations on story_generation_logs" ON story_generation_logs FOR ALL USING (true);
CREATE POLICY "Allow all operations on story_assets" ON story_assets FOR ALL USING (true);

-- Functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stories_updated_at BEFORE UPDATE ON stories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_story_pages_updated_at BEFORE UPDATE ON story_pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

