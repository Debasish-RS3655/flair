import jwt from 'jsonwebtoken';
import { Web3AuthHandlerCreator } from './context.js';

const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET || 'flair-session-secret';

type SessionJwtPayload = {
    sub?: string;
    action?: string;
};

export const jwtAuth: Web3AuthHandlerCreator = (ctx) => (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
        res.status(401).send({ error: { message: 'Authorization header not present.' } });
        return;
    }

    try {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token) {
            res.status(401).send({ error: { message: 'Session token not present.' } });
            return;
        }

        const payload = jwt.verify(token, SESSION_JWT_SECRET) as SessionJwtPayload;
        const principal = payload?.sub;
        if (!principal) {
            res.status(401).send({ error: { message: 'Invalid session token principal.' } });
            return;
        }

        if (!ctx.allowSkipCheck && payload?.action && payload.action !== ctx.action) {
            res.status(403).send({ error: { message: 'Session token action mismatch.' } });
            return;
        }

        res.locals.pubKey = principal;
        next();
    } catch (err: any) {
        res.status(401).send({ error: { message: err.message } });
    }
};
