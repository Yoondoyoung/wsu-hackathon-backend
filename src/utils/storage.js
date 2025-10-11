import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const PUBLIC_ROOT = path.resolve('public');

const ensureDir = async (dirPath) => {
  await mkdir(dirPath, { recursive: true });
};

const buildFileName = (prefix, extension) => {
  const safePrefix = prefix ? prefix.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() : 'asset';
  return `${safePrefix}-${randomUUID()}.${extension}`;
};

export const saveBase64Asset = async ({
  data,
  extension,
  directory,
  fileName,
}) => {
  console.log(`💾 Storage: Saving asset...`, { directory, fileName, dataLength: data?.length });
  
  if (!data) {
    console.error(`💾 Storage: Cannot write empty asset`);
    throw new Error('Cannot write empty asset');
  }

  const subDir = directory.replace(/^\/+/, '').replace(/\/$/, '');
  const absoluteDir = path.join(PUBLIC_ROOT, subDir);
  
  console.log(`💾 Storage: Creating directory: ${absoluteDir}`);
  await ensureDir(absoluteDir);

  const finalName = fileName ?? buildFileName('asset', extension);
  const filePath = path.join(absoluteDir, finalName);
  
  console.log(`💾 Storage: Writing file: ${filePath}`);
  await writeFile(filePath, Buffer.from(data, 'base64'));

  const publicPath = `/${subDir}/${finalName}`;
  const publicUrl = buildPublicUrl(publicPath);
  
  console.log(`💾 Storage: Successfully saved asset:`, { publicPath, publicUrl });
  return {
    filePath,
    publicPath,
    publicUrl,
  };
};

export const saveBufferAsset = async ({
  buffer,
  extension,
  directory,
  fileName,
}) => {
  if (!buffer) {
    throw new Error('Cannot write empty buffer');
  }

  const subDir = directory.replace(/^\/+/, '').replace(/\/$/, '');
  const absoluteDir = path.join(PUBLIC_ROOT, subDir);
  await ensureDir(absoluteDir);

  const finalName = fileName ?? buildFileName('asset', extension);
  const filePath = path.join(absoluteDir, finalName);
  await writeFile(filePath, buffer);

  const publicPath = `/${subDir}/${finalName}`;

  return {
    filePath,
    publicPath,
    publicUrl: buildPublicUrl(publicPath),
  };
};

export const buildPublicUrl = (publicPath) => {
  const base = process.env.ASSET_BASE_URL ?? '';
  if (!base) {
    return publicPath;
  }

  try {
    const url = new URL(publicPath, base);
    return url.toString();
  } catch (error) {
    return publicPath;
  }
};
