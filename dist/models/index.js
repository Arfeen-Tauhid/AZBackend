import { model, Schema } from 'mongoose';
const projectSchema = new Schema({
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    category: {
        type: String,
        required: true,
        enum: ['Short-form', 'YouTube', 'Podcast', 'Commercial', 'Motion graphics', 'Brand & promo'],
    },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    thumbnailUrl: { type: String, trim: true, maxlength: 2048 },
    thumbnailPublicId: { type: String, trim: true, maxlength: 300 },
    videoUrl: { type: String, trim: true, maxlength: 2048 },
    videoPublicId: { type: String, trim: true, maxlength: 300 },
    clientName: { type: String, trim: true, maxlength: 160 },
    brief: { type: String, trim: true, maxlength: 4000 },
    approach: { type: String, trim: true, maxlength: 4000 },
    deliverables: [{ type: String, trim: true, maxlength: 160 }],
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
        index: true,
    },
    publishedAt: { type: Date },
}, { timestamps: true });
projectSchema.index({ status: 1, publishedAt: -1 });
const serviceSchema = new Schema({
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    deliverables: [{ type: String, trim: true, maxlength: 160 }],
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });
const clientSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 160 },
    videoUrl: { type: String, trim: true, maxlength: 2048 },
    videoPublicId: { type: String, trim: true, maxlength: 300 },
    videoThumbnailUrl: { type: String, trim: true, maxlength: 2048 },
    videoThumbnailPublicId: { type: String, trim: true, maxlength: 300 },
    commentScreenshotUrl: { type: String, trim: true, maxlength: 2048 },
    commentScreenshotPublicId: { type: String, trim: true, maxlength: 300 },
    socialPlatform: { type: String, trim: true, maxlength: 40 },
    socialHandle: { type: String, trim: true, maxlength: 120 },
    isPublished: { type: Boolean, default: false },
}, { timestamps: true });
const testimonialSchema = new Schema({
    clientName: { type: String, required: true, trim: true, maxlength: 160 },
    role: { type: String, trim: true, maxlength: 160 },
    company: { type: String, trim: true, maxlength: 160 },
    quote: { type: String, required: true, trim: true, maxlength: 2000 },
    profileImageUrl: { type: String, trim: true, maxlength: 2048 },
    profileImagePublicId: { type: String, trim: true, maxlength: 300 },
    sourceUrl: { type: String, trim: true, maxlength: 2048 },
    rating: { type: Number, min: 1, max: 5 },
    status: {
        type: String,
        enum: ['draft', 'approved', 'archived'],
        default: 'draft',
        index: true,
    },
}, { timestamps: true });
const ratingSchema = new Schema({
    rating: { type: Number, required: true, min: 1, max: 5 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    socialPlatform: { type: String, required: true, trim: true, maxlength: 40 },
    socialHandle: { type: String, required: true, trim: true, maxlength: 120 },
}, { timestamps: true });
const inquirySchema = new Schema({
    inquiryNumber: { type: String, required: true, match: /^\d{8}$/ },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    company: { type: String, trim: true, maxlength: 120 },
    websiteOrSocial: { type: String, trim: true, maxlength: 300 },
    service: { type: String, required: true, trim: true, maxlength: 100 },
    projectDescription: { type: String, required: true, trim: true, maxlength: 5000 },
    budget: { type: String, trim: true, maxlength: 100 },
    deadline: { type: String, trim: true, maxlength: 40 },
    deliverables: { type: String, trim: true, maxlength: 500 },
    referenceLinks: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['new', 'in_progress', 'closed'], default: 'new', index: true },
    statusHistory: [
        {
            fromStatus: { type: String, enum: ['new', 'in_progress', 'closed'], required: true },
            toStatus: { type: String, enum: ['new', 'in_progress', 'closed'], required: true },
            comment: { type: String, trim: true, maxlength: 2000 },
            updatedBy: { type: String, required: true },
            updatedAt: { type: Date, required: true, default: Date.now },
        },
    ],
    consent: { type: Boolean, required: true },
}, { timestamps: true });
inquirySchema.index({ inquiryNumber: 1 }, { unique: true, sparse: true });
const adminSchema = new Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'full', 'limited', 'custom'], default: 'full' },
    permissions: {
        type: [
            {
                type: String,
                enum: [
                    'projects',
                    'clients',
                    'testimonials',
                    'services',
                    'site-settings',
                    'inquiries',
                    'ratings',
                ],
            },
        ],
        default: [],
    },
}, { timestamps: true });
const siteSettingsSchema = new Schema({
    key: { type: String, required: true, unique: true, default: 'main' },
    studioEmail: { type: String, trim: true, maxlength: 254 },
    discordId: { type: String, trim: true, maxlength: 100 },
    contactNumber: { type: String, trim: true, maxlength: 40 },
    instagramUrl: { type: String, trim: true, maxlength: 2048 },
    youtubeUrl: { type: String, trim: true, maxlength: 2048 },
    linkedinUrl: { type: String, trim: true, maxlength: 2048 },
    showreelUrl: { type: String, trim: true, maxlength: 2048 },
    showreelPublicId: { type: String, trim: true, maxlength: 300 },
    homeHeadline: { type: String, trim: true, maxlength: 240 },
    homeDescription: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true });
export const ProjectModel = model('Project', projectSchema);
export const ServiceModel = model('Service', serviceSchema);
export const ClientModel = model('Client', clientSchema);
export const TestimonialModel = model('Testimonial', testimonialSchema);
export const RatingModel = model('Rating', ratingSchema);
export const InquiryModel = model('Inquiry', inquirySchema);
export const AdminModel = model('Admin', adminSchema);
export const SiteSettingsModel = model('SiteSettings', siteSettingsSchema);
