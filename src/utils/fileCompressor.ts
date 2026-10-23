/**
 * Utility for image compression and file size validation
 * Points 14 & 15: File compression and weight limits
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0
  maxSizeMB?: number;
}

export const MAX_ALLOWED_FILE_SIZE_MB = 2.0; // 2 MB strict limit

/**
 * Validates file size before upload
 * @returns { valid: boolean, error?: string }
 */
export function validateFileSize(file: File, maxMB: number = MAX_ALLOWED_FILE_SIZE_MB): { valid: boolean; error?: string } {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > maxMB) {
    return {
      valid: false,
      error: `Fichier trop volumineux (${sizeMB.toFixed(1)} Mo). La taille maximale autorisée est de ${maxMB} Mo.`
    };
  }
  return { valid: true };
}

/**
 * Compresses an image file client-side before sending or storing
 * Scales down dimensions and recompresses as JPEG
 */
export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<{ file: File; blob: Blob; originalSize: number; compressedSize: number; compressionRatio: number }> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.75 } = options;

  // If not an image, return as-is
  if (!file.type.startsWith('image/')) {
    return {
      file,
      blob: file,
      originalSize: file.size,
      compressedSize: file.size,
      compressionRatio: 0
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier image.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Impossible de charger l\'image pour la compression.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate proportional scale
        if (width > maxWidth || height > maxHeight) {
          if (width / maxWidth > height / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Contexte Canvas non disponible pour la compression.'));
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Échec de la génération du blob compressé.'));
              return;
            }

            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now()
            });

            const ratio = Math.max(0, Math.round(((file.size - blob.size) / file.size) * 100));

            resolve({
              file: compressedFile,
              blob,
              originalSize: file.size,
              compressedSize: blob.size,
              compressionRatio: ratio
            });
          },
          'image/jpeg',
          quality
        );
      };

      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };

    reader.readAsDataURL(file);
  });
}
