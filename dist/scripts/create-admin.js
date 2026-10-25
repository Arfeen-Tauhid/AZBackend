import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AdminModel } from '../models/index.js';
import { env } from '../config/env.js';
const credentials = z
    .object({
    BOOTSTRAP_ADMIN_EMAIL: z.email(),
    BOOTSTRAP_ADMIN_PASSWORD: z
        .string()
        .min(12, 'Use at least 12 characters for the initial password.')
        .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.'),
})
    .safeParse(process.env);
if (!credentials.success) {
    console.error('Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters before provisioning.');
    process.exit(1);
}
try {
    await mongoose.connect(env.MONGODB_URI);
    if (await AdminModel.exists({})) {
        throw new Error('An admin account already exists; bootstrap only creates the initial owner account.');
    }
    const passwordHash = await bcrypt.hash(credentials.data.BOOTSTRAP_ADMIN_PASSWORD, 12);
    await AdminModel.create({
        email: credentials.data.BOOTSTRAP_ADMIN_EMAIL,
        passwordHash,
        role: 'owner',
    });
    console.info(`Owner admin provisioned for ${credentials.data.BOOTSTRAP_ADMIN_EMAIL}.`);
}
catch (error) {
    console.error('Could not provision owner admin:', error);
    process.exitCode = 1;
}
finally {
    await mongoose.disconnect();
}
