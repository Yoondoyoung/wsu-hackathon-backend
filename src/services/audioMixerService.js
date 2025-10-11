import { saveBase64Asset, saveBufferAsset } from '../utils/storage.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HttpError } from '../utils/errorHandlers.js';

// FFmpeg 경로 설정
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 실제 오디오 믹싱을 위한 개선된 서비스
 */
export const mixPageAudio = async ({ pageNumber, segments }) => {
  const usableSegment = segments.find((segment) => segment?.audioBase64);
  if (!usableSegment) {
    return null;
  }

  const { publicPath, publicUrl } = await saveBase64Asset({
    data: usableSegment.audioBase64,
    extension: 'mp3',
    directory: 'audio',
    fileName: `scene-${pageNumber}.mp3`,
  });

  return {
    publicPath,
    publicUrl,
  };
};

/**
 * 여러 오디오 버퍼를 순차적으로 믹싱하여 하나의 MP3 파일로 생성
 */
export const mixSequentialAudio = async (buffers) => {
  if (!buffers || buffers.length === 0) {
    return null;
  }
  
  if (buffers.length === 1) {
    return buffers[0];
  }

  try {
    // 임시 디렉토리 생성
    const tempDir = path.join(__dirname, '..', '..', 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    // 각 버퍼를 임시 파일로 저장
    const tempFiles = [];
    for (let i = 0; i < buffers.length; i++) {
      const tempFile = path.join(tempDir, `temp_${Date.now()}_${i}.mp3`);
      await fs.writeFile(tempFile, buffers[i]);
      tempFiles.push(tempFile);
    }

    // 출력 파일 경로
    const outputFile = path.join(tempDir, `mixed_${Date.now()}.mp3`);

    // FFmpeg를 사용하여 오디오 파일들을 순차적으로 연결
    await new Promise((resolve, reject) => {
      let command = ffmpeg();
      
      // 입력 파일들 추가
      tempFiles.forEach(file => {
        command = command.input(file);
      });

      command
        .on('end', () => {
          console.log('[audioMixer] Audio mixing completed successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('[audioMixer] FFmpeg error:', err);
          reject(new HttpError(500, 'Audio mixing failed', { error: err.message }));
        })
        .on('progress', (progress) => {
          console.log(`[audioMixer] Processing: ${progress.percent}% done`);
        })
        .complexFilter([
          // concat 필터를 사용하여 오디오들을 순차적으로 연결
          `concat=n=${tempFiles.length}:v=0:a=1[out]`
        ])
        .outputOptions(['-map', '[out]'])
        .output(outputFile)
        .run();
    });

    // 결과 파일 읽기
    const mixedBuffer = await fs.readFile(outputFile);

    // 임시 파일들 정리
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch (err) {
        console.warn(`[audioMixer] Failed to delete temp file ${file}:`, err.message);
      }
    }
    
    try {
      await fs.unlink(outputFile);
    } catch (err) {
      console.warn(`[audioMixer] Failed to delete output file ${outputFile}:`, err.message);
    }

    return mixedBuffer;

  } catch (error) {
    console.error('[audioMixer] Audio mixing failed:', error);
    
    // FFmpeg 실패 시 첫 번째 버퍼만 반환 (fallback)
    console.warn('[audioMixer] Falling back to first buffer only');
    return buffers[0];
  }
};

/**
 * SFX 타입에 따라 적절한 fade 효과 설정을 반환하는 함수
 */
const getSFXFadeSettings = (description) => {
  if (!description) {
    return { fadeIn: 0.2, fadeOut: 0.3 };
  }

  const lowerDesc = description.toLowerCase();
  
  // 급작스러운 효과음 - 짧은 fade
  if (lowerDesc.includes('click') || lowerDesc.includes('snap') || lowerDesc.includes('pop') ||
      lowerDesc.includes('beep') || lowerDesc.includes('ding') || lowerDesc.includes('tick') ||
      lowerDesc.includes('tap') || lowerDesc.includes('knock') || lowerDesc.includes('crash') ||
      lowerDesc.includes('bang') || lowerDesc.includes('explosion') || lowerDesc.includes('crack')) {
    return { fadeIn: 0.1, fadeOut: 0.2 };
  }
  
  // 자연스러운 효과음 - 중간 fade
  if (lowerDesc.includes('footstep') || lowerDesc.includes('walk') || lowerDesc.includes('run') ||
      lowerDesc.includes('rustle') || lowerDesc.includes('wind') || lowerDesc.includes('rain') ||
      lowerDesc.includes('thunder') || lowerDesc.includes('ocean') || lowerDesc.includes('forest')) {
    return { fadeIn: 0.3, fadeOut: 0.4 };
  }
  
  // 대화/소음 - 긴 fade
  if (lowerDesc.includes('laugh') || lowerDesc.includes('whisper') || lowerDesc.includes('murmur') ||
      lowerDesc.includes('chatter') || lowerDesc.includes('voice') || lowerDesc.includes('giggle') ||
      lowerDesc.includes('sigh') || lowerDesc.includes('gasp') || lowerDesc.includes('cough')) {
    return { fadeIn: 0.4, fadeOut: 0.5 };
  }
  
  // 기본값
  return { fadeIn: 0.2, fadeOut: 0.3 };
};

/**
 * SFX에 fade in/out 효과를 적용하는 함수
 */
export const applySFXFadeEffects = async (sfxBuffer, description = '', fadeInDuration = null, fadeOutDuration = null) => {
  if (!sfxBuffer) {
    return sfxBuffer;
  }

  try {
    // fade 설정 결정
    const fadeSettings = getSFXFadeSettings(description);
    const finalFadeIn = fadeInDuration ?? fadeSettings.fadeIn;
    const finalFadeOut = fadeOutDuration ?? fadeSettings.fadeOut;

    const tempDir = path.join(__dirname, '..', '..', 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const sfxFile = path.join(tempDir, `sfx_raw_${Date.now()}.mp3`);
    const outputFile = path.join(tempDir, `sfx_faded_${Date.now()}.mp3`);

    // 원본 SFX를 임시 파일로 저장
    await fs.writeFile(sfxFile, sfxBuffer);

    // FFmpeg를 사용하여 fade in/out 효과 적용
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(sfxFile)
        .audioFilters([
          `afade=t=in:st=0:d=${finalFadeIn}`,
          `afade=t=out:st=0:d=${finalFadeOut}`
        ])
        .output(outputFile)
        .on('end', () => {
          console.log(`[audioMixer] SFX fade effects applied (fadeIn: ${finalFadeIn}s, fadeOut: ${finalFadeOut}s)`);
          resolve();
        })
        .on('error', (err) => {
          console.error('[audioMixer] SFX fade effects error:', err);
          reject(new HttpError(500, 'SFX fade effects failed', { error: err.message }));
        })
        .run();
    });

    const fadedBuffer = await fs.readFile(outputFile);

    // 임시 파일들 정리
    [sfxFile, outputFile].forEach(async (file) => {
      try {
        await fs.unlink(file);
      } catch (err) {
        console.warn(`[audioMixer] Failed to delete temp file ${file}:`, err.message);
      }
    });

    return fadedBuffer;

  } catch (error) {
    console.error('[audioMixer] SFX fade effects failed:', error);
    return sfxBuffer; // fade 효과 실패 시 원본 SFX 반환
  }
};

/**
 * 오디오와 SFX를 동시에 믹싱 (오버레이) - fade 효과 포함
 */
export const mixAudioWithSFX = async (audioBuffer, sfxBuffer, sfxVolume = 0.3, applyFade = true, sfxDescription = '') => {
  if (!audioBuffer || !sfxBuffer) {
    return audioBuffer || sfxBuffer;
  }

  try {
    const tempDir = path.join(__dirname, '..', '..', 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const audioFile = path.join(tempDir, `audio_${Date.now()}.mp3`);
    const sfxFile = path.join(tempDir, `sfx_${Date.now()}.mp3`);
    const outputFile = path.join(tempDir, `mixed_with_sfx_${Date.now()}.mp3`);

    // 버퍼들을 임시 파일로 저장
    await fs.writeFile(audioFile, audioBuffer);
    await fs.writeFile(sfxFile, sfxBuffer);

    // SFX에 fade 효과 적용 여부에 따라 필터 구성
    let sfxFilters;
    if (applyFade) {
      const fadeSettings = getSFXFadeSettings(sfxDescription);
      sfxFilters = [
        `[1:a]volume=${sfxVolume},afade=t=in:st=0:d=${fadeSettings.fadeIn},afade=t=out:st=0:d=${fadeSettings.fadeOut}[sfx_vol]`
      ];
    } else {
      sfxFilters = [
        `[1:a]volume=${sfxVolume}[sfx_vol]`
      ];
    }

    const complexFilters = [
      ...sfxFilters,
      `[0:a][sfx_vol]amix=inputs=2:duration=first:dropout_transition=2[out]`
    ];

    // FFmpeg를 사용하여 오디오와 SFX 믹싱
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(audioFile)
        .input(sfxFile)
        .complexFilter(complexFilters)
        .outputOptions(['-map', '[out]'])
        .output(outputFile)
        .on('end', () => {
          console.log('[audioMixer] Audio with SFX mixing completed' + (applyFade ? ' (with fade effects)' : ''));
          resolve();
        })
        .on('error', (err) => {
          console.error('[audioMixer] SFX mixing error:', err);
          reject(new HttpError(500, 'SFX mixing failed', { error: err.message }));
        })
        .run();
    });

    const mixedBuffer = await fs.readFile(outputFile);

    // 임시 파일들 정리
    [audioFile, sfxFile, outputFile].forEach(async (file) => {
      try {
        await fs.unlink(file);
      } catch (err) {
        console.warn(`[audioMixer] Failed to delete temp file ${file}:`, err.message);
      }
    });

    return mixedBuffer;

  } catch (error) {
    console.error('[audioMixer] SFX mixing failed:', error);
    return audioBuffer; // SFX 믹싱 실패 시 원본 오디오만 반환
  }
};

export const saveSoundEffectBuffer = async ({ pageNumber, buffer }) => {
  if (!buffer) {
    return null;
  }

  const { publicPath, publicUrl } = await saveBufferAsset({
    buffer,
    extension: 'mp3',
    directory: 'audio/sfx',
    fileName: `scene-${pageNumber}-sfx.mp3`,
  });

  return {
    publicPath,
    publicUrl,
  };
};