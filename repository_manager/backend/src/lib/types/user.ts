// type declarations for the user schema


// user metadata for the metadata field inside the user schema
// must match the prisma schema
export type UserMetadata = {
    name?: string;
    email?: string;
    displayText?: string;
    profileImage?: string;
    bio?: string;
}