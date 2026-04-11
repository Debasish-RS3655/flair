// type declarations for the user schema

export type UserMetadata = {
    name: string | undefined;
    email: string | undefined;
    displayText: string | undefined;
    profileImage: string | undefined;
    bio: string | undefined;
    linkedWallet?: string;
}