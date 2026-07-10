// middleware/requireAuth.js

import { AppError } from "../utils/AppError.js";

export const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return next(new AppError("Unauthorized", 401));
    }

    next();
};