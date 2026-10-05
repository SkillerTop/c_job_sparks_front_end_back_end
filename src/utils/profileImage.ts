const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 512;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected image could not be opened.'));
    };
    image.src = url;
  });

export async function prepareProfilePhoto(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('The image must be 5 MB or smaller.');

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/webp', 0.84);
}
