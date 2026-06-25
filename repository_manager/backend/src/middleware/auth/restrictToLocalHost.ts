import { Request, Response, NextFunction } from "express";

// Debashish Buragohain

// for the tree functions
// middleware to restrict the endpoint only to localhost
export const restrictToLocalHost = (req: Request, res: Response, next: NextFunction): void => {
    const allowedIps = ['127.0.0.1', '::1'];
    // Extract the client's IP address
    const clientIp = req.ip;
    if (!clientIp) {
        res.status(400).send({ error: { message: 'Invalid IP address in request.' } });
        return;
    }
    // Check if the client's IP is in the list of allowed IPs
    if (allowedIps.includes(clientIp)) {
        next(); // Allow the request to proceed
    } else {
        res.status(403).send({ error: { message: 'Access forbidden: This endpoint is accessible only from localhost.' } });
        return;
    }
}