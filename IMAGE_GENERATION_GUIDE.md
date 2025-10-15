# Image Generation Guide with Runware AI

## 🎨 Overview

This project uses **Runware AI** with the **Seedream 4.0** model to generate high-quality, consistent illustrations for each scene in your storybook.

## 🔑 Features

### 1. Character Consistency
- **Reference Image System**: The first generated image is saved as a reference
- **Character Reference Strength**: 85% strength ensures consistent character appearance
- All subsequent scenes use the first image to maintain character consistency

### 2. Seedream 4.0 Model
- High-quality cinematic illustrations
- Better character consistency than traditional models
- Optimized for storybook-style artwork

### 3. Enhanced Quality Settings
- **Steps**: 40 (increased from 30 for better quality)
- **Guidance Scale**: 7.5 (optimal for prompt following)
- **Scheduler**: Euler A (better for detailed illustrations)
- **Aspect Ratio**: 16:9 (cinematic format)
- **Output Format**: PNG (lossless quality)

## 🚀 Setup

### 1. Get Runware API Key
1. Sign up at [https://runware.ai](https://runware.ai)
2. Get your API key from the dashboard
3. Add to your `.env` file:

```env
RUNWARE_API_KEY=your_runware_api_key_here
ENABLE_IMAGES=true
```

### 2. Enable Image Generation
Update your `.env` file:
```env
# Enable image generation
ENABLE_IMAGES=true

# Other required settings
ENABLE_AUDIO=true
ENABLE_ELEVEN_ENDPOINTS=true
```

### 3. Test Image Generation
```bash
cd backend
npm run dev
```

Create a story and check the console for image generation logs:
```
🎨 Runware: Starting image generation for page 1...
🎨 Runware: Calling Runware API for page 1...
🎨 Runware: Successfully generated image for page 1
```

## 📝 How It Works

### Image Generation Flow

1. **First Scene (Page 1)**:
   ```javascript
   {
     prompt: "A brave knight in a magical forest. High quality digital illustration...",
     model: "seedream-4.0",
     steps: 40,
     guidance_scale: 7.5,
     // No reference image yet
   }
   ```

2. **Subsequent Scenes (Page 2+)**:
   ```javascript
   {
     prompt: "The same brave knight discovering a castle. Maintain consistent character appearance...",
     model: "seedream-4.0",
     reference_images: [firstSceneImage], // Reference to page 1
     character_reference_strength: 0.85, // 85% consistency
     steps: 40,
     guidance_scale: 7.5,
   }
   ```

### Character Consistency System

```javascript
// storyPipeline.js
const generateIllustration = async ({ storyId, page, prompt }) => {
  const referenceImage = getReferenceImage(storyId); // Get first image
  
  const illustration = await generateSceneIllustration({
    prompt,
    pageNumber: page,
    referenceImage, // Use as reference for consistency
  });

  // Save first image as reference
  if (!referenceImage && illustration?.imageBase64) {
    setReferenceImage(storyId, illustration.imageBase64);
  }

  return illustration;
};
```

## 🎯 Best Practices

### 1. Writing Good Image Prompts

**Good Prompt** (from GPT):
```json
{
  "image_prompt": "A young adventurer with brown hair and green eyes standing in a mystical forest filled with glowing mushrooms and ancient trees. Cinematic lighting, detailed background, storybook illustration style."
}
```

**What Makes It Good**:
- Describes character appearance clearly
- Includes scene details
- Mentions lighting and atmosphere
- Specifies art style

### 2. Negative Prompts

Automatically applied:
- `blurry, low quality`
- `violent, scary`
- `photorealistic`
- `inconsistent characters`
- `deformed, ugly, bad anatomy`
- `text, watermark`

### 3. Aspect Ratio

Default: `16:9` (cinematic)

Can be changed in runwareService.js:
```javascript
aspectRatio: '16:9', // or '3:2', '1:1', '4:3'
```

## 🔧 Configuration Options

### Adjust Quality Settings

In `runwareService.js`:

```javascript
{
  steps: 40, // 20-50: Higher = better quality, slower
  guidance_scale: 7.5, // 5-10: Higher = closer to prompt
  character_reference_strength: 0.85, // 0-1: Higher = more consistent
  scheduler: 'euler_a', // euler_a, dpmsolver++, etc.
}
```

### Adjust Prompt Enhancement

```javascript
const enhancedPrompt = referenceImage 
  ? `${prompt}. Maintain consistent character appearance and art style from previous scenes.`
  : `${prompt}. High quality digital illustration, consistent character design, storybook art style.`;
```

## 📊 Performance

- **Generation Time**: ~30-60 seconds per image
- **Image Size**: ~500KB - 2MB per PNG
- **Quality**: High resolution, suitable for display

## 🐛 Troubleshooting

### Images Not Generating

1. Check `.env` file:
   ```bash
   ENABLE_IMAGES=true
   RUNWARE_API_KEY=your_key_here
   ```

2. Check API key:
   ```bash
   curl -X POST https://api.runware.ai/v1/images/generate \
     -H "Authorization: Bearer YOUR_KEY" \
     -H "Content-Type: application/json"
   ```

3. Check logs:
   ```
   [features] ENABLE_IMAGES = true => true
   🎨 Runware: Starting image generation...
   ```

### Character Inconsistency

1. **Increase reference strength**:
   ```javascript
   character_reference_strength: 0.9 // (from 0.85)
   ```

2. **Use same seed**:
   ```javascript
   seed: 12345 // Fixed seed for all scenes
   ```

3. **Improve prompts**:
   - Be more specific about character appearance
   - Mention consistent features in each prompt

### Timeout Errors

1. **Increase timeout**:
   ```javascript
   timeout: 180000 // 3 minutes (from 2 minutes)
   ```

2. **Reduce steps**:
   ```javascript
   steps: 30 // (from 40)
   ```

## 📈 API Limits

Check your Runware plan for:
- Requests per minute
- Total images per month
- Concurrent requests

## 🎉 Example Output

With image generation enabled, each story page will have:

```json
{
  "page": 1,
  "scene_title": "The Awakening",
  "timeline": [...],
  "image_prompt": "...",
  "assets": {
    "image": "/public/images/page-1.png", // ✅ Generated image
    "audio": "/public/audio/mixed/scene-1.mp3"
  }
}
```

## 🚀 Next Steps

1. Enable image generation in `.env`
2. Add your Runware API key
3. Create a story
4. Check the generated images in `/backend/public/images/`
5. View images in the storybook player

Enjoy creating beautiful, consistent storybooks! 📚✨



