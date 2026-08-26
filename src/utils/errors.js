class NonRetryableError extends Error {
    constructor(message) {
        super(message);
        this.name = "NonRetryableError";
    }
}

class RetryableError extends Error {
    constructor(message) {
        super(message);
        this.name = "RetryableError";
    }
}

function classifyError(error) {
    const message = error.message?.toLowerCase() || "";

    const permanentPatterns = [
        "invalid data found",
        "no such file or directory",
        "moov atom not found",
        "unrecognized option",
        "invalid argument",
        "cast to objectid failed",
    ];

    for (const pattern of permanentPatterns) {
        if (message.includes(pattern)) {
            return "permanent";
        }
    }

    const transientPatterns = [
        "econnrefused",
        "econnreset",
        "etimedout",
        "socket hand up",
        "replica set",
        "enomem",
    ]

    for (const pattern of transientPatterns) {
        if (message.includes(pattern)) {
            return "transient";
        }
    }

    return "unknown";
}

export { NonRetryableError, RetryableError, classifyError };