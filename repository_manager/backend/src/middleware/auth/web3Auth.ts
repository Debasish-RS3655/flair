// middleware to check if the request has a valid signature of the wallet
// Debashish Buragohain

import { Response } from 'express';
import { Web3AuthHandlerCreator } from './context';
import { verifyGenSignIn } from '../../lib/auth/general/index.js';

export const genAuth: Web3AuthHandlerCreator = (ctx) => (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    res.status(401).send({ error: { message: 'Authorization header not present.' } });
    return;
  }
  try {
    const authorizedPk = verifyGenSignIn(authHeader, ctx.action);
    // this is an unreachable condition but added for safety
    if (!authorizedPk) {
      res.status(401).send({ error: { message: 'authorization failed.' } });
      return;
    }
    // reaches here means we are authorized
    res.locals.pubKey = authorizedPk;
    next();
  }
  catch (err: any) {
    res.status(401).send({ error: {message:  err.message} });
    return;
  }
}

// extract the authenticated principal from request context.
// for wallet-auth users, this is a wallet address.
// for google-auth users, this is expected to be `google:<sub>`.
export const authorizedPrincipal = (res: Response) => res.locals.pubKey as string;

// backwards-compatible alias used by legacy controllers.
export const authorizedPk = authorizedPrincipal;



