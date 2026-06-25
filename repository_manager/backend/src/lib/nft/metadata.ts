// metadata generator for commit and repository Nfts
// Debashish Buragohain



// MIGRATION: prisma v7 migration syntax
// import { Commit, Repository, Prisma.JsonValue as JsonValue } from "../../generated/prisma/client.js";

// prisma v6 migration syntax
import { Commit, Repository } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/library";

import { commitMetrics, CommitNftMetdata } from "../types/commit";
import { prisma } from "../prisma/index.js";
// Use the exported Prisma.JsonValue type instead of the runtime path
import { RepositoryMetadataWithAllRequiredFields, RepositoryMetdata, RepositoryNftCollectionMetadata } from "../types/repo";
import { constructIPFSUrl } from "../../lib/ipfs/ipfs.js"; 

// function to create the metadata of the commit Nft
export const createCommitMetadata = async (commit: Commit): Promise<CommitNftMetdata> => {
    const metadata: Partial<CommitNftMetdata> = {};
    metadata.commitHash = commit.commitHash;

    const branch = await prisma.branch.findUnique({ where: { id: commit.branchId } });
    if (!branch) {
        throw new Error("Commit's branch does not exist.");
    }
    metadata.branchName = branch.name;
    metadata.branchHash = branch.branchHash;

    const repo = await prisma.repository.findUnique({ where: { id: branch.repositoryId } });
    if (!repo) {
        throw new Error("Commit's repository does not exist.");
    }
    metadata.repositoryHash = repo.repoHash;
    metadata.repositoryName = repo.name;
    metadata.repositoryOwner = repo.ownerAddress;
    if (!repo.baseModelHash) {
        throw new Error("Commit's base model does not exist.");
    }
    metadata.baseModelHash = repo.baseModelHash;    

    // the merger commit is removed in v2 but the logic will be applied for check point commits in the near future
    // if (commit.status == 'MERGERCOMMIT') {
    //     throw new Error('Commit is a merger commit, and cannot be converted into an Nft.');
    // }

    metadata.status = commit.status;
    metadata.committer = commit.committerAddress;
    metadata.paramHash = commit.paramHash;
    metadata.message = commit.message;
    // if (commit.status == 'REJECTED') {
    //     if (!commit.rejectedMessage) {
    //         throw new Error('Rejection message not present in rejected commit.');
    //     }
    //     metadata.messageIfRejected = commit.rejectedMessage;
    // }
    metadata.createdAt = commit.createdAt.toISOString();
    metadata.localMetrics = parseMetrics(commit.metrics);
    return metadata as CommitNftMetdata;
}

// parse the metric values
export function parseMetrics(metric: JsonValue): commitMetrics {
    // Allow missing/null metrics by returning an empty metadata object.
    if (metric === null || metric === undefined) {
        return {};
    }

    if (typeof metric !== "object" || Array.isArray(metric)) {
        throw new Error("Invalid commit metrics: Expected an object.");
    }

    const parsed: commitMetrics = {};
    for (const [key, value] of Object.entries(metric as Record<string, unknown>)) {
        if (
            value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            parsed[key] = value;
            continue;
        }

        throw new Error(`Invalid commit metric value for '${key}'. Expected string, number, boolean, or null.`);
    }

    return parsed;
}

// create the metadata for uploading in the collection
export const createRepositoryMetadata = async (repo: Repository): Promise<RepositoryNftCollectionMetadata> => {
    const metadata: Partial<RepositoryNftCollectionMetadata> = {};
    const { name, description, useCase, creator, framework } = parseRepoMetadata(repo.metadata);
    metadata.name = name;
    metadata.description = description;
    metadata.useCase = useCase;
    metadata.creator = creator;
    metadata.framework = framework;
    metadata.createdAt = repo.createdAt.toISOString();
    metadata.owner = repo.ownerAddress;
    const { baseModelHash } = repo;
    if (!baseModelHash) {
        throw new Error('base model hash is a required field.');
    }
    metadata.baseModelHash = baseModelHash;
    metadata.baseModelUri= constructIPFSUrl(baseModelHash);        // in the latest version we calculate the url dynamically
    return metadata as RepositoryNftCollectionMetadata;
}

// we cannot have undefined fields the metadata of the nft
export function parseRepoMetadata(repoMetadata: JsonValue): RepositoryMetadataWithAllRequiredFields {
    if (typeof repoMetadata !== "object" || repoMetadata === null || Array.isArray(repoMetadata)) {
        throw new Error("Invalid commit metrics: Expected an object.");
    }
    const { name, description, useCase, creator, framework } = repoMetadata as Record<string, unknown>;
    if (!name || !description || !useCase || !creator || !framework) {
        throw new Error("Missing required repository metadata fields.");
    }
    return { name, description, useCase, creator, framework } as RepositoryMetadataWithAllRequiredFields;
}

