export function createHttpError(status, message, details) {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    return error;
}

export function getErrorResponse(error, fallbackMessage) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const message = error?.message || fallbackMessage;

    if (error?.details !== undefined) {
        return {
            status,
            body: {
                message,
                details: error.details
            }
        };
    }

    return {
        status,
        body: { message }
    };
}
