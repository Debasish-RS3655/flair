import { Keypair } from "@solana/web3.js";
import { Web3AuthHandlerCreator } from "./context"
import { createUser } from "../../lib/auth/user/index.js";
import { prisma } from "../../lib/prisma/index.js";

// bypass the authentication for testing
// generates a temporary id _anonymous for the session
// Debashish Buragohain

export const ByPassAuth: Web3AuthHandlerCreator = (ctx) => async (req, res, next) => {
    // in the bypass handler, before creating a new anonymous account we remove the previous anonymous accounts

    // uncomment to delete the anonymous
    // await prisma.user.delete({where: {principal: '_anonymous'}});

    const pubkey = '_anonymous';
    const userExists = await prisma.user.findUnique({ where: { principal: pubkey } });
    // create the user only if he does not already exists
    if (!userExists) await createUser(pubkey);
    // after creation we update the user as an anonymous user
    res.locals.pubKey = pubkey;
    next();
}


// logic to create anonymous users through random public keys, deprecated
// const prevAnonymousUsers = await prisma.user.findMany({
//     where: { principal: { contains: '_anonymous' } }
// });
// const deletePromises = prevAnonymousUsers.map(user => {
//     prisma.user.delete({ where: { principal: user.principal } });
// });
// const deletedUsers = await Promise.all(deletePromises);
// if (!deletedUsers) console.log('Deleted previous anonymous users.')
// const keypair = Keypair.generate()
// const pubkey = keypair.publicKey.toBase58();
// console.log('User created through Anonymous public key generation by Auth Bypass Handler: ', pubkey)