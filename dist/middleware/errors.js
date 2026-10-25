import { ZodError } from 'zod';
export class HttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'HttpError';
    }
}
export const notFound = (_request, _response, next) => {
    next(new HttpError(404, 'The requested resource was not found.'));
};
export const errorHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
        response.status(400).json({
            error: {
                message: 'The request contains invalid data.',
                details: error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                })),
            },
        });
        return;
    }
    if (error instanceof HttpError) {
        response.status(error.statusCode).json({ error: { message: error.message } });
        return;
    }
    if (error &&
        typeof error === 'object' &&
        'type' in error &&
        error.type === 'entity.parse.failed') {
        response.status(400).json({ error: { message: 'Request body must contain valid JSON.' } });
        return;
    }
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
        response.status(413).json({ error: { message: 'Request body exceeds the permitted size.' } });
        return;
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        response
            .status(409)
            .json({ error: { message: 'A record with that unique value already exists.' } });
        return;
    }
    console.error('Unhandled request error:', error);
    response.status(500).json({ error: { message: 'An unexpected server error occurred.' } });
};
