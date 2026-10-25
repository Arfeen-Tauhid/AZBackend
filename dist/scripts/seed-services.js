import mongoose from 'mongoose';
import { ServiceModel } from '../models/index.js';
import { env } from '../config/env.js';
const services = [
    {
        title: 'YouTube video editing',
        description: 'Long-form stories shaped with intentional pacing, clear structure, and a finish that serves your voice and your viewers.',
        deliverables: [
            'Story structure and assembly',
            'Pacing, graphics, and titles',
            'Color and audio finishing',
        ],
        sortOrder: 1,
    },
    {
        title: 'Short-form content',
        description: 'Focused edits for vertical platforms, shaped around a clear idea and the strongest moments in your footage.',
        deliverables: ['Vertical-first framing', 'Captions and motion accents', 'Social cutdowns'],
        sortOrder: 2,
    },
    {
        title: 'Podcast editing',
        description: 'Clean, considered post-production that keeps the conversation natural and easy to follow.',
        deliverables: ['Dialogue cleanup', 'Multicam synchronization', 'Episode and social exports'],
        sortOrder: 3,
    },
    {
        title: 'Motion graphics and animation',
        description: 'Purposeful visual details that clarify, support, and add character to your story.',
        deliverables: ['Titles and lower thirds', '2D animation', 'Branded visual elements'],
        sortOrder: 4,
    },
    {
        title: 'Color grading and sound',
        description: 'A cohesive picture and balanced mix, finished with care for your material and intended platform.',
        deliverables: [
            'Color correction and grading',
            'Dialogue and noise cleanup',
            'Sound design and mix',
        ],
        sortOrder: 5,
    },
    {
        title: 'Brand and commercial video',
        description: 'A polished edit that gives your message a clear beginning, middle, and reason to be remembered.',
        deliverables: [
            'Promotional videos',
            'Product and brand stories',
            'Ad versions and deliverables',
        ],
        sortOrder: 6,
    },
    {
        title: 'Content repurposing',
        description: 'Turn approved long-form footage into useful short-form edits for your chosen channels.',
        deliverables: ['Highlight selection', 'Platform-specific cutdowns', 'Captioned versions'],
        sortOrder: 7,
    },
];
try {
    await mongoose.connect(env.MONGODB_URI);
    const existingCount = await ServiceModel.countDocuments();
    if (existingCount > 0) {
        console.info(`Service seed skipped; ${existingCount} service record(s) already exist.`);
    }
    else {
        await ServiceModel.insertMany(services);
        console.info(`Added ${services.length} starter services. Edit or remove them from the admin dashboard.`);
    }
}
catch (error) {
    console.error('Could not seed starter services:', error);
    process.exitCode = 1;
}
finally {
    await mongoose.disconnect();
}
