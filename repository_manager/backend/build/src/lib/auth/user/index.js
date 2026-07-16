// the user schema manager for Flair
// Debashish Buragohain
import { prisma } from "../../prisma/index.js";
export async function createUser(principal) {
    return await prisma.user.create({
        data: { principal }
    });
}
export async function userExists(principal) {
    const user = await prisma.user.findUnique({ where: { principal } });
    return !!user;
}
