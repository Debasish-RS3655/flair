import { Response, RequestHandler } from "express";

/**
 * Configuration context that is passed to the middleware via
 * function currying, this allows for several configurations
 * to modify how the validations are performed.
 */

export type Web3AuthConfigurationContext = {
    /**
     * The action field is the name of the action that is being performed.
     * This is used to determine the signed message is correct, and also specifies
     * a persmission from the client to perform an activity.
     * If action is `"signin"`, and the handler is configured to `allowSkipCheck = true`, then
     * the check will be skipped, which is useful for JWT-Like authentication
     * on several types of endpoints (Like reading).
     */
    action: string;
    /**
     * If set to `true`, the current execution context will allow for an action
     * to be "skip", skipping the action check if the endpoint allows for it.
     */
    allowSkipCheck?: boolean;
};

export type Web3AuthHandlerCreator = (
    ctx: Web3AuthConfigurationContext,
) => RequestHandler;

/**
 * This authentication middleware is used to verify
 * that the request is signed by the owner of the public key.
 * It uses an authorization header with the following format:
 * `Authorization: Bearer pk.msg.sig`
 * Where pk is the base58-encoded public key, msg is the base58-encoded message,
 * and sig is the base58-encoded signature.
 * This middleware does not validate the lifetime of the signature or the
 * contents of the message.
 */


// the default sign in context
export const signInContext: Web3AuthConfigurationContext = { allowSkipCheck: true, action: 'signin' };
// the create tree message signing constant
export const createTreeContext: Web3AuthConfigurationContext = {allowSkipCheck: false, action: 'createTree'};