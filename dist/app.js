import bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { randomInt } from 'node:crypto';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from './config/env.js';
import { AdminModel, ClientModel, InquiryModel, ProjectModel, RatingModel, ServiceModel, SiteSettingsModel, TestimonialModel, } from './models/index.js';
import { errorHandler, HttpError, notFound } from './middleware/errors.js';
import { requireAdmin, requireAdminResourceAccess, requireOwner } from './middleware/auth.js';
import { getMediaPolicyError, mediaLimits } from './services/mediaPolicy.js';
import { adminInquirySchema, adminInquiryUpdateSchema, clientSchema, createAdminSchema, inquiryStatusSchema, inquirySchema, loginSchema, projectSchema, publicRatingSchema, serviceSchema, siteSettingsSchema, testimonialSchema, } from './validators/index.js';
const app = express();
let databaseConnection = null;
const uploadSchema = z.object({ resourceType: z.enum(['image', 'video']) });
const uploadedMediaSchema = z.object({
    resourceType: z.enum(['image', 'video']),
    publicId: z.string().trim().min(1).max(300),
});
const dummyPasswordHash = bcrypt.hashSync('az-studios-invalid-password', 12);
app.disable('x-powered-by');
if (env.TRUST_PROXY > 0)
    app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((request, response, next) => {
    const startedAt = Date.now();
    response.on('finish', () => {
        console.info(`${request.method} ${request.path} ${response.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
});
app.use('/api', async (_request, _response, next) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            databaseConnection ??= mongoose.connect(env.MONGODB_URI).catch((error) => {
                databaseConnection = null;
                throw error;
            });
            await databaseConnection;
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
const makeRateLimiter = (windowMs, limit) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
        response
            .status(429)
            .json({ error: { message: 'Too many requests. Please try again later.' } });
    },
});
const loginLimiter = makeRateLimiter(15 * 60 * 1000, 10);
const inquiryLimiter = makeRateLimiter(60 * 60 * 1000, 5);
const inquiryLookupLimiter = makeRateLimiter(15 * 60 * 1000, 10);
const ratingLimiter = makeRateLimiter(60 * 60 * 1000, 3);
const apiLimiter = makeRateLimiter(15 * 60 * 1000, 300);
app.use('/api', apiLimiter);
function sendData(response, data, status = 200) {
    response.status(status).json({ data });
}
function parsePage(value, fallback, maximum) {
    if (value === undefined)
        return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value))
        throw new HttpError(400, 'Pagination values must be positive integers.');
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1)
        throw new HttpError(400, 'Pagination values must be positive integers.');
    return Math.min(parsed, maximum);
}
function pagination(query) {
    const page = parsePage(query.page, 1, 100000);
    const limit = parsePage(query.limit, 9, 50);
    return { page, limit, skip: (page - 1) * limit };
}
function isDuplicateInquiryNumber(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000 &&
        'keyPattern' in error &&
        typeof error.keyPattern === 'object' &&
        error.keyPattern !== null &&
        'inquiryNumber' in error.keyPattern);
}
async function createInquiryRecord(input, consent) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            return await InquiryModel.create({
                ...input,
                inquiryNumber: String(randomInt(10_000_000, 100_000_000)),
                consent,
            });
        }
        catch (error) {
            if (!isDuplicateInquiryNumber(error) || attempt === 4)
                throw error;
        }
    }
    throw new Error('Could not generate a unique inquiry number.');
}
app.get('/api/health', (_request, response) => {
    sendData(response, {
        status: mongoose.connection.readyState === 1 ? 'ok' : 'database_unavailable',
    });
});
app.get('/api/public/projects', async (request, response) => {
    const { page, limit, skip } = pagination(request.query);
    const filter = { status: 'published' };
    if (typeof request.query.category === 'string' && request.query.category !== 'All work') {
        filter.category = request.query.category;
    }
    const [items, total] = await Promise.all([
        ProjectModel.find(filter)
            .select('-videoPublicId -thumbnailPublicId -__v')
            .sort({ publishedAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        ProjectModel.countDocuments(filter),
    ]);
    sendData(response, { items, page, pages: Math.ceil(total / limit), total });
});
app.get('/api/public/projects/:slug', async (request, response) => {
    const project = await ProjectModel.findOne({ slug: request.params.slug, status: 'published' })
        .select('-videoPublicId -thumbnailPublicId -__v')
        .lean();
    if (!project)
        throw new HttpError(404, 'Project not found.');
    sendData(response, project);
});
app.get('/api/public/services', async (_request, response) => {
    const items = await ServiceModel.find({ isActive: true })
        .select('-__v')
        .sort({ sortOrder: 1, title: 1 })
        .lean();
    sendData(response, items);
});
app.get('/api/public/clients', async (_request, response) => {
    const items = await ClientModel.find({ isPublished: true })
        .select('name videoUrl videoThumbnailUrl commentScreenshotUrl socialPlatform socialHandle')
        .sort({ name: 1 })
        .lean();
    sendData(response, items);
});
app.get('/api/public/testimonials', async (_request, response) => {
    const items = await TestimonialModel.find({ status: 'approved' })
        .select('-profileImagePublicId -__v')
        .sort({ createdAt: -1 })
        .lean();
    sendData(response, items);
});
async function publicRatingSummary() {
    const [result] = await RatingModel.aggregate([
        { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
    ]);
    return {
        count: result?.count ?? 0,
        average: result?.average ?? 0,
    };
}
app.get('/api/public/ratings', async (_request, response) => {
    sendData(response, await publicRatingSummary());
});
app.get('/api/public/site-settings', async (_request, response) => {
    const item = await SiteSettingsModel.findOne({ key: 'main' })
        .select('-__v -showreelPublicId')
        .lean();
    sendData(response, item ?? {});
});
app.get('/api/public/inquiries/:inquiryNumber', inquiryLookupLimiter, async (request, response) => {
    const { inquiryNumber } = request.params;
    if (typeof inquiryNumber !== 'string' || !/^\d{8}$/.test(inquiryNumber)) {
        throw new HttpError(400, 'Enter your 8-digit inquiry number.');
    }
    const inquiry = await InquiryModel.findOne({ inquiryNumber })
        .select('inquiryNumber status')
        .lean();
    if (!inquiry)
        throw new HttpError(404, 'No inquiry was found with that number.');
    sendData(response, inquiry);
});
app.post('/api/public/inquiries', inquiryLimiter, async (request, response) => {
    const input = inquirySchema.parse(request.body);
    if (input.website)
        throw new HttpError(400, 'The inquiry could not be accepted.');
    const { website: _honeypot, ...inquiry } = input;
    const item = await createInquiryRecord(inquiry, true);
    if (env.INQUIRY_WEBHOOK_URL) {
        try {
            const notification = await fetch(env.INQUIRY_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'new_inquiry',
                    inquiry: {
                        ...inquiry,
                        id: item.id,
                        inquiryNumber: item.inquiryNumber,
                        createdAt: item.createdAt,
                    },
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (!notification.ok)
                console.error(`Inquiry notification webhook returned HTTP ${notification.status}.`);
        }
        catch (error) {
            console.error('Inquiry was saved, but the configured notification webhook failed:', error);
        }
    }
    sendData(response, {
        inquiryNumber: item.inquiryNumber,
        message: 'Your inquiry was received.',
    }, 201);
});
app.post('/api/public/ratings', ratingLimiter, async (request, response) => {
    const rating = publicRatingSchema.parse(request.body);
    await RatingModel.create(rating);
    sendData(response, {
        ...(await publicRatingSummary()),
        message: 'Thank you for rating your experience.',
    }, 201);
});
app.post('/api/admin/auth/login', loginLimiter, async (request, response) => {
    const { email, password } = loginSchema.parse(request.body);
    const admin = await AdminModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    const passwordIsValid = await bcrypt.compare(password, admin?.passwordHash ?? dummyPasswordHash);
    if (!admin || !passwordIsValid)
        throw new HttpError(401, 'Email or password is incorrect.');
    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: admin.id,
        expiresIn: '8h',
    });
    response.cookie('az_admin', token, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
    });
    sendData(response, {
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions ?? [],
    });
});
app.post('/api/admin/auth/logout', (_request, response) => {
    response.clearCookie('az_admin', {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'strict',
        path: '/',
    });
    sendData(response, { message: 'Logged out.' });
});
app.get('/api/admin/auth/me', requireAdmin, async (request, response) => {
    const admin = await AdminModel.findById(request.adminId).select('email role permissions').lean();
    if (!admin)
        throw new HttpError(401, 'Admin account not found.');
    sendData(response, {
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions ?? [],
    });
});
app.use('/api/admin', requireAdmin);
app.use('/api/admin', requireAdminResourceAccess);
app.get('/api/admin/admins', requireOwner, async (_request, response) => {
    const admins = await AdminModel.find()
        .select('email role permissions createdAt')
        .sort({ createdAt: 1 })
        .lean();
    sendData(response, admins);
});
app.post('/api/admin/admins', requireOwner, async (request, response) => {
    const input = createAdminSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const allPermissions = [
        'projects',
        'clients',
        'testimonials',
        'services',
        'site-settings',
        'inquiries',
        'ratings',
    ];
    const role = allPermissions.every((permission) => input.permissions.includes(permission))
        ? 'full'
        : 'custom';
    const admin = await AdminModel.create({
        email: input.email.toLowerCase(),
        passwordHash,
        role,
        permissions: input.permissions,
    });
    sendData(response, {
        _id: admin.id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        createdAt: admin.createdAt,
    }, 201);
});
app.delete('/api/admin/admins/:id', requireOwner, async (request, response) => {
    if (!mongoose.isValidObjectId(request.params.id))
        throw new HttpError(400, 'Invalid admin ID.');
    if (request.params.id === request.adminId) {
        throw new HttpError(400, 'You cannot revoke your own admin account.');
    }
    const target = await AdminModel.findById(request.params.id).select('role');
    if (!target)
        throw new HttpError(404, 'Admin account not found.');
    if (target.role === 'owner') {
        throw new HttpError(403, 'Owner accounts cannot be removed from the dashboard.');
    }
    await target.deleteOne();
    response.status(204).end();
});
app.get('/api/admin/dashboard', async (request, response) => {
    const permissions = request.adminPermissions ?? [];
    const canRead = (permission) => request.adminRole === 'owner' ||
        request.adminRole === 'full' ||
        (request.adminRole === 'limited' &&
            ['projects', 'services', 'clients', 'testimonials'].includes(permission)) ||
        permissions.includes(permission);
    const [projects, inquiries, publishedProjects, newInquiries] = await Promise.all([
        canRead('projects')
            ? ProjectModel.countDocuments({ status: { $ne: 'archived' } })
            : Promise.resolve(0),
        canRead('inquiries') ? InquiryModel.countDocuments() : Promise.resolve(0),
        canRead('projects') ? ProjectModel.countDocuments({ status: 'published' }) : Promise.resolve(0),
        canRead('inquiries') ? InquiryModel.countDocuments({ status: 'new' }) : Promise.resolve(0),
    ]);
    sendData(response, { projects, inquiries, publishedProjects, newInquiries });
});
function registerContentRoutes(path, resource, statusSchema) {
    app.get(`/api/admin/${path}`, async (request, response) => {
        const { page, limit } = pagination(request.query);
        const statusValue = request.query.status;
        let status;
        if (statusValue !== undefined) {
            if (!statusSchema) {
                throw new HttpError(400, 'Status filtering is not available for this resource.');
            }
            status = statusSchema.parse(statusValue);
        }
        const { items, total } = await resource.list(page, limit, status);
        sendData(response, { items, page, pages: Math.ceil(total / limit), total });
    });
    app.post(`/api/admin/${path}`, async (request, response) => {
        const item = await resource.create(request.body);
        sendData(response, item, 201);
    });
    app.patch(`/api/admin/${path}/:id`, async (request, response) => {
        if (!mongoose.isValidObjectId(request.params.id))
            throw new HttpError(400, 'Invalid record ID.');
        const item = await resource.update(request.params.id, request.body);
        if (!item)
            throw new HttpError(404, 'Record not found.');
        sendData(response, item);
    });
    app.delete(`/api/admin/${path}/:id`, async (request, response) => {
        if (!mongoose.isValidObjectId(request.params.id))
            throw new HttpError(400, 'Invalid record ID.');
        const deleted = await resource.remove(request.params.id);
        if (!deleted)
            throw new HttpError(404, 'Record not found.');
        response.status(204).end();
    });
}
const projectsResource = {
    async list(page, limit, status) {
        const filter = status === 'draft'
            ? { status: 'draft' }
            : status === 'published'
                ? { status: 'published' }
                : status === 'archived'
                    ? { status: 'archived' }
                    : {};
        const [items, total] = await Promise.all([
            ProjectModel.find(filter)
                .select('-__v')
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ProjectModel.countDocuments(filter),
        ]);
        return { items, total };
    },
    async create(input) {
        const parsed = projectSchema.parse(input);
        return ProjectModel.create({
            ...parsed,
            publishedAt: parsed.status === 'published' ? new Date() : undefined,
        });
    },
    async update(id, input) {
        const parsed = projectSchema
            .partial()
            .refine((value) => Object.keys(value).length > 0)
            .parse(input);
        const update = {
            ...parsed,
            ...(parsed.status === 'published' ? { publishedAt: new Date() } : {}),
        };
        return ProjectModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
            .select('-__v')
            .lean();
    },
    async remove(id) {
        return Boolean(await ProjectModel.findByIdAndDelete(id).select('_id').lean());
    },
};
const clientsResource = {
    async list(page, limit) {
        const [items, total] = await Promise.all([
            ClientModel.find()
                .select('-__v')
                .sort({ name: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ClientModel.countDocuments(),
        ]);
        return { items, total };
    },
    async create(input) {
        return ClientModel.create(clientSchema.parse(input));
    },
    async update(id, input) {
        const parsed = clientSchema
            .partial()
            .refine((value) => Object.keys(value).length > 0)
            .parse(input);
        return ClientModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true })
            .select('-__v')
            .lean();
    },
    async remove(id) {
        return Boolean(await ClientModel.findByIdAndDelete(id).select('_id').lean());
    },
};
const testimonialsResource = {
    async list(page, limit, status) {
        const filter = status === 'draft'
            ? { status: 'draft' }
            : status === 'approved'
                ? { status: 'approved' }
                : status === 'archived'
                    ? { status: 'archived' }
                    : {};
        const [items, total] = await Promise.all([
            TestimonialModel.find(filter)
                .select('-__v')
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            TestimonialModel.countDocuments(filter),
        ]);
        return { items, total };
    },
    async create(input) {
        return TestimonialModel.create(testimonialSchema.parse(input));
    },
    async update(id, input) {
        const parsed = testimonialSchema
            .partial()
            .refine((value) => Object.keys(value).length > 0)
            .parse(input);
        return TestimonialModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true })
            .select('-__v')
            .lean();
    },
    async remove(id) {
        return Boolean(await TestimonialModel.findByIdAndDelete(id).select('_id').lean());
    },
};
const servicesResource = {
    async list(page, limit) {
        const [items, total] = await Promise.all([
            ServiceModel.find()
                .select('-__v')
                .sort({ sortOrder: 1, title: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ServiceModel.countDocuments(),
        ]);
        return { items, total };
    },
    async create(input) {
        return ServiceModel.create(serviceSchema.parse(input));
    },
    async update(id, input) {
        const parsed = serviceSchema
            .partial()
            .refine((value) => Object.keys(value).length > 0)
            .parse(input);
        return ServiceModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true })
            .select('-__v')
            .lean();
    },
    async remove(id) {
        return Boolean(await ServiceModel.findByIdAndDelete(id).select('_id').lean());
    },
};
const settingsResource = {
    async list(page, limit) {
        const [items, total] = await Promise.all([
            SiteSettingsModel.find()
                .select('-__v')
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            SiteSettingsModel.countDocuments(),
        ]);
        return { items, total };
    },
    async create(input) {
        const parsed = siteSettingsSchema.parse(input);
        return SiteSettingsModel.findOneAndUpdate({ key: 'main' }, parsed, {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        })
            .select('-__v')
            .lean();
    },
    async update(id, input) {
        const parsed = siteSettingsSchema
            .partial()
            .refine((value) => Object.keys(value).length > 0)
            .parse(input);
        return SiteSettingsModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true })
            .select('-__v')
            .lean();
    },
    async remove(id) {
        return Boolean(await SiteSettingsModel.findByIdAndDelete(id).select('_id').lean());
    },
};
const ratingsResource = {
    async list(page, limit) {
        const [items, total] = await Promise.all([
            RatingModel.find()
                .select('-__v')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            RatingModel.countDocuments(),
        ]);
        return { items, total };
    },
    async create(input) {
        return RatingModel.create(publicRatingSchema.parse(input));
    },
    async update(id, input) {
        const parsed = publicRatingSchema
            .partial()
            .refine((value) => Object.keys(value).length > 0)
            .parse(input);
        return RatingModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true })
            .select('-__v')
            .lean();
    },
    async remove(id) {
        return Boolean(await RatingModel.findByIdAndDelete(id).select('_id').lean());
    },
};
registerContentRoutes('projects', projectsResource, z.enum(['draft', 'published', 'archived']));
registerContentRoutes('clients', clientsResource);
registerContentRoutes('testimonials', testimonialsResource, z.enum(['draft', 'approved', 'archived']));
registerContentRoutes('services', servicesResource);
registerContentRoutes('site-settings', settingsResource);
registerContentRoutes('ratings', ratingsResource);
app.post('/api/admin/inquiries', async (request, response) => {
    const input = adminInquirySchema.parse(request.body);
    const item = await createInquiryRecord(input, false);
    sendData(response, item.toObject({ versionKey: false }), 201);
});
app.patch('/api/admin/inquiries/:id', async (request, response) => {
    if (!mongoose.isValidObjectId(request.params.id))
        throw new HttpError(400, 'Invalid inquiry ID.');
    const { comment, ...updates } = adminInquiryUpdateSchema.parse(request.body);
    const item = await InquiryModel.findById(request.params.id);
    if (!item)
        throw new HttpError(404, 'Inquiry not found.');
    if (updates.status && item.status !== updates.status) {
        const admin = await AdminModel.findById(request.adminId).select('email').lean();
        if (!admin)
            throw new HttpError(401, 'Admin account not found.');
        item.statusHistory.push({
            fromStatus: item.status,
            toStatus: updates.status,
            comment,
            updatedBy: admin.email,
            updatedAt: new Date(),
        });
    }
    item.set(updates);
    await item.save();
    const result = item.toObject({ versionKey: false });
    sendData(response, result);
});
app.delete('/api/admin/inquiries/:id', async (request, response) => {
    if (!mongoose.isValidObjectId(request.params.id))
        throw new HttpError(400, 'Invalid inquiry ID.');
    const deleted = await InquiryModel.findByIdAndDelete(request.params.id).select('_id').lean();
    if (!deleted)
        throw new HttpError(404, 'Inquiry not found.');
    response.status(204).end();
});
app.get('/api/admin/inquiries', async (request, response) => {
    const { page, limit, skip } = pagination(request.query);
    const status = request.query.status === undefined
        ? undefined
        : inquiryStatusSchema.shape.status.parse(request.query.status);
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
        InquiryModel.find(filter).select('-__v').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        InquiryModel.countDocuments(filter),
    ]);
    sendData(response, { items, page, pages: Math.ceil(total / limit), total });
});
app.post('/api/admin/uploads/signature', async (request, response) => {
    const input = uploadSchema.parse(request.body);
    if (!env.CLOUDINARY_CLOUD_NAME ||
        !env.CLOUDINARY_API_KEY ||
        !env.CLOUDINARY_API_SECRET ||
        !env.CLOUDINARY_UPLOAD_PRESET) {
        throw new HttpError(503, 'Media uploads are not configured on this server.');
    }
    cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
        folder: `az-studios/${input.resourceType}`,
        timestamp,
        upload_preset: env.CLOUDINARY_UPLOAD_PRESET,
    };
    const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
    sendData(response, {
        ...params,
        signature,
        apiKey: env.CLOUDINARY_API_KEY,
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        maxFileSizeBytes: mediaLimits[input.resourceType].maxBytes,
        allowedFormats: mediaLimits[input.resourceType].formats,
    });
});
app.post('/api/admin/uploads/verify', async (request, response) => {
    const { resourceType, publicId } = uploadedMediaSchema.parse(request.body);
    if (!env.CLOUDINARY_CLOUD_NAME ||
        !env.CLOUDINARY_API_KEY ||
        !env.CLOUDINARY_API_SECRET ||
        !env.CLOUDINARY_UPLOAD_PRESET) {
        throw new HttpError(503, 'Media uploads are not configured on this server.');
    }
    cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
    });
    const resource = await cloudinary.api.resource(publicId, { resource_type: resourceType });
    const approvedFolder = `az-studios/${resourceType}`;
    const isInApprovedFolder = resource.asset_folder === approvedFolder || resource.public_id.startsWith(`${approvedFolder}/`);
    const policyError = getMediaPolicyError(resourceType, resource.format, resource.bytes);
    if (resource.resource_type !== resourceType || !isInApprovedFolder || policyError) {
        const deletion = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        if (deletion.result !== 'ok' && deletion.result !== 'not found') {
            throw new HttpError(502, 'The uploaded file was rejected and could not be cleaned up.');
        }
        throw new HttpError(400, policyError ?? 'Uploaded media is outside the approved folder or has an invalid type.');
    }
    sendData(response, {
        publicId: resource.public_id,
        secureUrl: resource.secure_url,
        resourceType: resource.resource_type,
        format: resource.format,
        bytes: resource.bytes,
        width: resource.width,
        height: resource.height,
        duration: resource.duration,
    });
});
app.use(notFound);
app.use(errorHandler);
export { app };
export default app;
