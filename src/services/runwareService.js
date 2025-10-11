import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { HttpError } from '../utils/errorHandlers.js';

const RUNWARE_URL = 'https://api.runware.ai/v1';

const requireApiKey = () => {
  if (!process.env.RUNWARE_API_KEY) {
    throw new HttpError(500, 'RUNWARE_API_KEY is not configured.');
  }
};

const getArtStyleDescription = (artStyle) => {
  const styleMap = {
    'storybook': 'storybook illustration style, warm and inviting',
    'watercolor': 'watercolor painting style, soft and flowing',
    'digital-painting': 'digital painting style, detailed and vibrant',
    'paper-cut': 'paper cut art style, layered and dimensional',
    'comic': 'comic book art style, bold and dynamic',
    'photorealistic': 'photorealistic style, highly detailed and lifelike',
    'oil-painting': 'oil painting style, rich textures and colors',
    'sketch': 'pencil sketch style, artistic and expressive',
    'anime': 'anime art style, colorful and stylized',
    'cartoon': 'cartoon art style, fun and playful',
    'cinematic': 'cinematic art style, dramatic lighting and composition',
    'fantasy-art': 'fantasy art style, magical and ethereal'
  };
  
  return styleMap[artStyle] || 'storybook illustration style, warm and inviting';
};

const getAspectRatioDimensions = (aspectRatio) => {
  // NanoBanan (google:4@1) supported dimensions:
  // '0x0', '1024x1024', '1248x832', '832x1248', '1184x864', '864x1184', 
  // '896x1152', '1152x896', '768x1344', '1344x768', '1536x672'
  
  const supportedDimensions = {
    '1:1': { width: 1024, height: 1024 }, // 1024x1024
    '4:3': { width: 1184, height: 864 }, // 1184x864 (closest to 4:3)
    '3:2': { width: 1248, height: 832 }, // 1248x832 (closest to 3:2)
    '16:9': { width: 1536, height: 672 }, // 1536x672 (closest to 16:9)
    '21:9': { width: 1536, height: 672 } // 1536x672 (closest to 21:9)
  };
  
  return supportedDimensions[aspectRatio] || supportedDimensions['3:2']; // Default to 3:2
};

export const generateSceneIllustration = async ({
  prompt,
  pageNumber,
  artStyle = 'Storybook',
  aspectRatio = '3:2',
  seed,
  characterReferences = [],
  storyId = null,
}) => {
  console.log(`🎨 Runware: Generating image for page ${pageNumber}...`);
  
  requireApiKey();

  try {
    // Process character references for Runware API
    const referenceImages = [];
    if (characterReferences && characterReferences.length > 0) {
      for (const ref of characterReferences) {
        if (ref.imageBase64) {
          // Runware API expects base64 strings directly, not objects
          // Keep the data URI format as it includes the image type
          referenceImages.push(ref.imageBase64);
        }
      }
    }

    // Enhance prompt for better consistency and quality
    const artStyleDescription = getArtStyleDescription(artStyle);
    let enhancedPrompt = prompt;
    
    if (referenceImages.length > 0) {
      // Add character reference information to prompt using original characterReferences
      const characterInfo = characterReferences.map((ref, index) => 
        `Character ${ref.id} (${ref.characterName}): Use reference image ${index + 1} to maintain consistent appearance`
      ).join('. ');
      
      enhancedPrompt = `${prompt}. ${characterInfo}. Maintain consistent character appearance and art style from reference images. ${artStyleDescription}, high quality digital illustration, clean composition, professional artwork.`;
    } else {
      enhancedPrompt = `${prompt}. ${artStyleDescription}, high quality digital illustration, consistent character design, clean composition, professional artwork, vibrant colors, detailed rendering.`;
    }

    const taskUUID = uuidv4();
    const dimensions = getAspectRatioDimensions(aspectRatio);
    
    // Use provided seed or generate a consistent seed based on story/page
    // Runware API requires seed to be between 1 and 2147483647
    let finalSeed = seed;
    if (!finalSeed) {
      if (storyId) {
        // Create a consistent seed based on story ID and page number
        // This ensures same story has consistent style, but different pages have variation
        const storyHash = storyId.split('-').join('').substring(0, 8);
        const storyNum = parseInt(storyHash, 16) || 12345;
        // Keep within valid range (1 to 2147483647)
        finalSeed = ((storyNum % 1000000) + (pageNumber * 1000)) % 2147483647;
        if (finalSeed === 0) finalSeed = 1; // Ensure minimum value of 1
      } else {
        // Fallback to page-based seed within valid range
        finalSeed = ((pageNumber * 12345) % 2147483647) + 1;
      }
    }
    
    // Ensure seed is within valid range
    if (finalSeed < 1) finalSeed = 1;
    if (finalSeed > 2147483647) finalSeed = finalSeed % 2147483647;
    const payload = [
      {
        taskUUID: taskUUID,
        taskType: 'imageInference',
        numberResults: 1,
        outputFormat: 'JPEG',
        width: dimensions.width,
        height: dimensions.height,
        seed: finalSeed,
        includeCost: false,
        model: 'google:4@1',
        positivePrompt: enhancedPrompt,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      }
    ];


    const response = await axios.post(
      RUNWARE_URL,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2 minutes timeout for image generation
      }
    );

    const { data } = response;
    
    // The response structure is { data: [{ imageURL: "...", ... }] }
    const dataArray = data?.data;
    const result = Array.isArray(dataArray) && dataArray.length > 0 ? dataArray[0] : null;
    
    // Check for various possible image URL field names
    const imageURL = result?.imageURL || result?.image_url || result?.url || result?.imageUrl || result?.image;

    if (!imageURL) {
      console.error(`🎨 Runware: No image URL found in any field for page ${pageNumber}:`, result);
      throw new HttpError(502, 'Runware did not return image URL', result);
    }

    console.log(`🎨 Runware: Successfully generated image for page ${pageNumber}`);
    return {
      pageNumber,
      prompt,
      imageURL: imageURL, // Use the found image URL
      meta: {
        aspectRatio,
        artStyle,
        imageUUID: result.imageUUID,
        seed: result.seed,
        model: 'google:4@1 (NanoBanan)',
        cost: result.cost,
      },
    };
  } catch (error) {
    console.error(`🎨 Runware: Error generating image for page ${pageNumber}:`, error.message, error.response?.data);
    
    if (error.response) {
      const errorData = error.response.data;
      console.error(`🎨 Runware: API Error Details:`, errorData);
      throw new HttpError(error.response.status, 'Runware API error', errorData);
    }

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, 'Failed to generate illustration with Runware.', {
      message: error.message,
      prompt,
      pageNumber,
    });
  }
};
