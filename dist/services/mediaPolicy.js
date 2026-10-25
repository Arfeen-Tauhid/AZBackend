export const mediaLimits = {
    image: {
        maxBytes: 15 * 1024 * 1024,
        formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
    video: {
        maxBytes: 100 * 1024 * 1024,
        formats: ['mp4', 'webm', 'mov'],
    },
};
export function getMediaPolicyError(resourceType, format, bytes) {
    const policy = mediaLimits[resourceType];
    const allowedFormats = policy.formats;
    if (!allowedFormats.includes(format.toLowerCase())) {
        return `Unsupported ${resourceType} format.`;
    }
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > policy.maxBytes) {
        return `${resourceType === 'image' ? 'Image' : 'Video'} exceeds the permitted file size.`;
    }
    return null;
}
