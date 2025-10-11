import { supabase } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import { HttpError } from '../utils/errorHandlers.js';

/**
 * Session Management Service
 * Handles session creation, retrieval, and management for story generation
 */

// Generate a unique session ID
export const generateSessionId = () => {
  return `session_${Date.now()}_${uuidv4().slice(0, 8)}`;
};

// Create a new session
export const createSession = async (sessionId, metadata = {}) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        session_id: sessionId,
        user_agent: metadata.userAgent,
        ip_address: metadata.ipAddress,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[session] Create session error:', error);
      throw new HttpError(500, 'Failed to create session', { error: error.message });
    }

    console.log(`[session] Created session: ${sessionId}`);
    return data;
  } catch (error) {
    console.error('[session] Create session failed:', error);
    throw error;
  }
};

// Get session by ID
export const getSession = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Session not found
        return null;
      }
      console.error('[session] Get session error:', error);
      throw new HttpError(500, 'Failed to get session', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[session] Get session failed:', error);
    throw error;
  }
};

// Update session
export const updateSession = async (sessionId, updates) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('[session] Update session error:', error);
      throw new HttpError(500, 'Failed to update session', { error: error.message });
    }

    return data;
  } catch (error) {
    console.error('[session] Update session failed:', error);
    throw error;
  }
};

// Deactivate session
export const deactivateSession = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .update({ is_active: false })
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('[session] Deactivate session error:', error);
      throw new HttpError(500, 'Failed to deactivate session', { error: error.message });
    }

    console.log(`[session] Deactivated session: ${sessionId}`);
    return data;
  } catch (error) {
    console.error('[session] Deactivate session failed:', error);
    throw error;
  }
};

// Get or create session (convenience method)
export const getOrCreateSession = async (sessionId, metadata = {}) => {
  try {
    // Try to get existing session
    let session = await getSession(sessionId);
    
    if (!session) {
      // Create new session if it doesn't exist
      session = await createSession(sessionId, metadata);
    }
    
    return session;
  } catch (error) {
    console.error('[session] Get or create session failed:', error);
    throw error;
  }
};

// Get session statistics
export const getSessionStats = async (sessionId) => {
  try {
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, status, created_at')
      .eq('session_id', sessionId);

    if (storiesError) {
      console.error('[session] Get session stats error:', storiesError);
      throw new HttpError(500, 'Failed to get session stats', { error: storiesError.message });
    }

    const stats = {
      totalStories: stories.length,
      completedStories: stories.filter(s => s.status === 'completed').length,
      generatingStories: stories.filter(s => s.status === 'generating').length,
      failedStories: stories.filter(s => s.status === 'failed').length,
      lastActivity: stories.length > 0 ? Math.max(...stories.map(s => new Date(s.created_at).getTime())) : null
    };

    return stats;
  } catch (error) {
    console.error('[session] Get session stats failed:', error);
    throw error;
  }
};

// Clean up old sessions (utility function)
export const cleanupOldSessions = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabase
      .from('sessions')
      .update({ is_active: false })
      .lt('created_at', cutoffDate.toISOString())
      .eq('is_active', true);

    if (error) {
      console.error('[session] Cleanup old sessions error:', error);
      throw new HttpError(500, 'Failed to cleanup old sessions', { error: error.message });
    }

    console.log(`[session] Cleaned up sessions older than ${daysOld} days`);
    return data;
  } catch (error) {
    console.error('[session] Cleanup old sessions failed:', error);
    throw error;
  }
};

