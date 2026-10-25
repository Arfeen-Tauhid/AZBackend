import { z } from 'zod';
const webUrl = z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
}, 'URL must use HTTP or HTTPS.');
const url = z.union([webUrl, z.literal('')]).optional();
const optionalText = (max) => z.string().trim().max(max).optional();
export const loginSchema = z.object({
    email: z.email().max(254),
    password: z
        .string()
        .min(1)
        .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long.'),
});
export const createAdminSchema = z.object({
    email: z.email().max(254),
    password: z
        .string()
        .min(12, 'Use at least 12 characters for the admin password.')
        .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.'),
    permissions: z
        .array(z.enum([
        'projects',
        'clients',
        'testimonials',
        'services',
        'site-settings',
        'inquiries',
        'ratings',
    ]))
        .min(1, 'Select at least one permission.')
        .max(7)
        .refine((permissions) => new Set(permissions).size === permissions.length, {
        message: 'Permissions must not be duplicated.',
    }),
});
export const inquiryStatusSchema = z.object({
    status: z.enum(['new', 'in_progress', 'closed']),
    comment: z.string().trim().max(2000).optional(),
});
export const inquirySchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(254),
    company: optionalText(120),
    websiteOrSocial: optionalText(300),
    service: z.string().trim().min(1).max(100),
    projectDescription: z.string().trim().min(20).max(5000),
    budget: z
        .enum(['Under $500', '$500–$1,500', '$1,500–$5,000', '$5,000+', 'Not sure yet'])
        .optional(),
    deadline: z.union([z.iso.date(), z.literal('')]).optional(),
    deliverables: optionalText(500),
    referenceLinks: optionalText(1000),
    consent: z.literal(true),
    website: optionalText(300),
});
export const publicRatingSchema = z.object({
    rating: z.number().int().min(1).max(5),
    name: z.string().trim().min(2).max(160),
    socialPlatform: z.string().trim().min(1).max(40),
    socialHandle: z.string().trim().min(1).max(120),
});
export const adminInquirySchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(254),
    company: optionalText(120),
    websiteOrSocial: optionalText(300),
    service: z.string().trim().min(1).max(100),
    projectDescription: z.string().trim().min(20).max(5000),
    budget: z
        .enum(['Under $500', '$500–$1,500', '$1,500–$5,000', '$5,000+', 'Not sure yet'])
        .optional(),
    deadline: z.union([z.iso.date(), z.literal('')]).optional(),
    deliverables: optionalText(500),
    referenceLinks: optionalText(1000),
    status: z.enum(['new', 'in_progress', 'closed']).default('new'),
});
export const adminInquiryUpdateSchema = adminInquirySchema
    .omit({ status: true })
    .partial()
    .extend({
    status: z.enum(['new', 'in_progress', 'closed']).optional(),
    comment: z.string().trim().max(2000).optional(),
})
    .refine((value) => Object.keys(value).some((key) => key !== 'comment'));
const sharedContent = {
    status: z.enum(['draft', 'published', 'archived']).default('draft'),
};
export const projectSchema = z.object({
    slug: z
        .string()
        .trim()
        .min(1)
        .max(160)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(160),
    category: z.enum([
        'Short-form',
        'YouTube',
        'Podcast',
        'Commercial',
        'Motion graphics',
        'Brand & promo',
    ]),
    description: z.string().trim().min(1).max(4000),
    thumbnailUrl: url,
    thumbnailPublicId: optionalText(300),
    videoUrl: url,
    videoPublicId: optionalText(300),
    clientName: optionalText(160),
    brief: optionalText(4000),
    approach: optionalText(4000),
    deliverables: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    ...sharedContent,
});
export const serviceSchema = z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(2000),
    deliverables: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
});
export const clientSchema = z.object({
    name: z.string().trim().min(1).max(160),
    videoUrl: url,
    videoPublicId: optionalText(300),
    videoThumbnailUrl: url,
    videoThumbnailPublicId: optionalText(300),
    commentScreenshotUrl: url,
    commentScreenshotPublicId: optionalText(300),
    socialPlatform: optionalText(40),
    socialHandle: optionalText(120),
    isPublished: z.boolean().optional(),
});
export const testimonialSchema = z.object({
    clientName: z.string().trim().min(1).max(160),
    role: optionalText(160),
    company: optionalText(160),
    quote: z.string().trim().min(1).max(2000),
    profileImageUrl: url,
    profileImagePublicId: optionalText(300),
    sourceUrl: url,
    rating: z.number().int().min(1).max(5).optional(),
    status: z.enum(['draft', 'approved', 'archived']).default('draft'),
});
export const siteSettingsSchema = z.object({
    studioEmail: z.union([z.email(), z.literal('')]).optional(),
    discordId: optionalText(100),
    contactNumber: optionalText(40),
    instagramUrl: url,
    youtubeUrl: url,
    linkedinUrl: url,
    showreelUrl: url,
    showreelPublicId: optionalText(300),
    homeHeadline: optionalText(240),
    homeDescription: optionalText(1000),
});
