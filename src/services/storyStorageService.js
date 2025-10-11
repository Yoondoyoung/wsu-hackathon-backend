import { supabase } from '../config/supabase.js';
import { HttpError } from '../utils/errorHandlers.js';

/**
 * Story Storage Service
 * Handles saving and retrieving stories from Supabase
 */

// Save story metadata
export const saveStory = async (sessionId, storyData) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .insert({
        session_id: sessionId,
        title: storyData.title,
        genre: storyData.genre,
        target_audience: storyData.target_audience,
        theme: storyData.theme,
        story_length: storyData.story_length,
        art_style: storyData.art_style,
        main_character: storyData.main_character,
        supporting_characters: storyData.supporting_characters,
        narration_voice_id: storyData.narration_voice_id,
        narration_tone: storyData.narration_tone,
        status: 'generating'
      })
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Save story error:', error);
      throw new HttpError(500, 'Failed to save story', { error: error.message });
    }

    console.log(`[storyStorage] Saved story: ${data.id}`);
    return data;
  } catch (error) {
    console.error('[storyStorage] Save story failed:', error);
    throw error;
  }
};

// Update story with generated content (title, etc.)
export const updateStoryWithGeneratedContent = async (storyId, generatedTitle) => {
  try {
    const updates = { 
      title: generatedTitle,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('stories')
      .update(updates)
      .eq('id', storyId)
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Update story with generated content error:', error);
      throw new HttpError(500, 'Failed to update story with generated content', { error: error.message });
    }

    console.log(`[storyStorage] Updated story ${storyId} with generated title: ${generatedTitle}`);
    return data;
  } catch (error) {
    console.error('[storyStorage] Update story with generated content failed:', error);
    throw error;
  }
};

// Update story status
export const updateStoryStatus = async (storyId, status, errorMessage = null) => {
  try {
    const updates = { status };
    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const { data, error } = await supabase
      .from('stories')
      .update(updates)
      .eq('id', storyId)
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Update story status error:', error);
      throw new HttpError(500, 'Failed to update story status', { error: error.message });
    }

    console.log(`[storyStorage] Updated story ${storyId} status to: ${status}`);
    return data;
  } catch (error) {
    console.error('[storyStorage] Update story status failed:', error);
    throw error;
  }
};

// Save story page
export const saveStoryPage = async (storyId, pageData) => {
  try {
    // Validate required fields
    if (!pageData.pageNumber) {
      throw new HttpError(400, 'Page number is required', { pageData });
    }

    console.log(`[storyStorage] Saving page ${pageData.pageNumber} for story ${storyId}`);

    const { data, error } = await supabase
      .from('story_pages')
      .insert({
        story_id: storyId,
        page_number: pageData.pageNumber,
        scene_title: pageData.scene_title,
        image_prompt: pageData.image_prompt,
        image_url: pageData.image_url,
        audio_url: pageData.audio_url,
        timeline: pageData.timeline
      })
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Save story page error:', error);
      throw new HttpError(500, 'Failed to save story page', { error: error.message });
    }

    console.log(`[storyStorage] Saved story page: ${data.id}`);
    return data;
  } catch (error) {
    console.error('[storyStorage] Save story page failed:', error);
    throw error;
  }
};

// Update story page
export const updateStoryPage = async (storyId, pageNumber, updates) => {
  try {
    const { data, error } = await supabase
      .from('story_pages')
      .update(updates)
      .eq('story_id', storyId)
      .eq('page_number', pageNumber)
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Update story page error:', error);
      throw new HttpError(500, 'Failed to update story page', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Update story page failed:', error);
    throw error;
  }
};

// Get story by ID
export const getStory = async (storyId) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        story_pages (*)
      `)
      .eq('id', storyId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Story not found
      }
      console.error('[storyStorage] Get story error:', error);
      throw new HttpError(500, 'Failed to get story', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Get story failed:', error);
    throw error;
  }
};

// Get stories by session ID
export const getStoriesBySession = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        story_pages (*)
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[storyStorage] Get stories by session error:', error);
      throw new HttpError(500, 'Failed to get stories by session', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Get stories by session failed:', error);
    throw error;
  }
};

// Get all stories from database with pagination
export const getAllStoriesFromDB = async (limit = 16, offset = 0) => {
  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('stories')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('[storyStorage] Get stories count error:', countError);
      throw new HttpError(500, 'Failed to get stories count', { error: countError.message });
    }

    // Get paginated stories
    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        story_pages (*)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[storyStorage] Get all stories error:', error);
      throw new HttpError(500, 'Failed to get all stories', { error: error.message });
    }

    return {
      stories: data || [],
      total: count || 0
    };
  } catch (error) {
    console.error('[storyStorage] Get all stories failed:', error);
    throw error;
  }
};

// Save story generation log
export const saveGenerationLog = async (storyId, logData) => {
  try {
    const { data, error } = await supabase
      .from('story_generation_logs')
      .insert({
        story_id: storyId,
        page_number: logData.pageNumber,
        log_type: logData.type,
        message: logData.message,
        metadata: logData.metadata
      })
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Save generation log error:', error);
      throw new HttpError(500, 'Failed to save generation log', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Save generation log failed:', error);
    throw error;
  }
};

// Get generation logs for a story
export const getGenerationLogs = async (storyId) => {
  try {
    const { data, error } = await supabase
      .from('story_generation_logs')
      .select('*')
      .eq('story_id', storyId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[storyStorage] Get generation logs error:', error);
      throw new HttpError(500, 'Failed to get generation logs', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Get generation logs failed:', error);
    throw error;
  }
};

// Save story asset
export const saveStoryAsset = async (storyId, assetData) => {
  try {
    const { data, error } = await supabase
      .from('story_assets')
      .insert({
        story_id: storyId,
        page_number: assetData.pageNumber,
        asset_type: assetData.type,
        asset_url: assetData.url,
        file_path: assetData.filePath,
        file_size: assetData.fileSize,
        mime_type: assetData.mimeType
      })
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Save story asset error:', error);
      throw new HttpError(500, 'Failed to save story asset', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Save story asset failed:', error);
    throw error;
  }
};

// Save audio file as base64 in database
export const saveAudioToDatabase = async (storyId, pageNumber, audioBuffer, mimeType = 'audio/mpeg') => {
  try {
    const audioBase64 = audioBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${audioBase64}`;
    
    const { data, error } = await supabase
      .from('story_assets')
      .insert({
        story_id: storyId,
        page_number: pageNumber,
        asset_type: 'audio',
        asset_url: dataUrl,
        file_path: null, // No local file
        file_size: audioBuffer.length,
        mime_type: mimeType
      })
      .select()
      .single();

    if (error) {
      console.error('[storyStorage] Save audio to database error:', error);
      throw new HttpError(500, 'Failed to save audio to database', { error: error.message });
    }

    console.log(`[storyStorage] Audio saved to database for story ${storyId}, page ${pageNumber} (${Math.round(audioBuffer.length / 1024)}KB)`);
    return data;
  } catch (error) {
    console.error('[storyStorage] Save audio to database failed:', error);
    throw error;
  }
};

// Get story assets
export const getStoryAssets = async (storyId) => {
  try {
    const { data, error } = await supabase
      .from('story_assets')
      .select('*')
      .eq('story_id', storyId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[storyStorage] Get story assets error:', error);
      throw new HttpError(500, 'Failed to get story assets', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[storyStorage] Get story assets failed:', error);
    throw error;
  }
};

// Delete story (and all related data)
export const deleteStory = async (storyId) => {
  try {
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId);

    if (error) {
      console.error('[storyStorage] Delete story error:', error);
      throw new HttpError(500, 'Failed to delete story', { error: error.message });
    }

    console.log(`[storyStorage] Deleted story: ${storyId}`);
    return true;
  } catch (error) {
    console.error('[storyStorage] Delete story failed:', error);
    throw error;
  }
};
