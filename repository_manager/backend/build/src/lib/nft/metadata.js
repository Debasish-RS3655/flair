// metadata generator for commit and repository Nfts
// Debashish Buragohain
import { CommitStatus } from "@prisma/client";
import { prisma } from "../prisma/index.js";
import { constructIPFSUrl } from "../../lib/ipfs/ipfs.js";
// function to create the metadata of the commit Nft
export const createCommitMetadata = async (commit) => {
    if (commit.status == CommitStatus.REJECTED) {
        throw new Error('Rejected commit cannot be converted into an Nft.');
    }
    const metadata = {};
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
    if (commit.status == CommitStatus.MERGER) {
        throw new Error('Commit is a merger commit, and cannot be converted into an Nft.');
    }
    metadata.status = commit.status;
    metadata.committer = commit.committerAddress;
    metadata.paramHash = commit.paramHash;
    metadata.message = commit.message;
    metadata.createdAt = commit.createdAt.toISOString();
    metadata.localMetrics = parseMetrics(commit.metrics);
    return metadata;
};
// parse the metric values
export function parseMetrics(metric) {
    // Allow missing/null metrics by returning an empty metadata object.
    if (metric === null || metric === undefined) {
        return {};
    }
    if (typeof metric !== "object" || Array.isArray(metric)) {
        throw new Error("Invalid commit metrics: Expected an object.");
    }
    const parsed = {};
    for (const [key, value] of Object.entries(metric)) {
        if (value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean") {
            parsed[key] = value;
            continue;
        }
        throw new Error(`Invalid commit metric value for '${key}'. Expected string, number, boolean, or null.`);
    }
    return parsed;
}
// create the metadata for uploading in the collection
export const createRepositoryMetadata = async (repo) => {
    const metadata = {};
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
    metadata.baseModelUri = constructIPFSUrl(baseModelHash); // in the latest version we calculate the url dynamically
    return metadata;
};
// we cannot have undefined fields the metadata of the nft
export function parseRepoMetadata(repoMetadata) {
    if (typeof repoMetadata !== "object" || repoMetadata === null || Array.isArray(repoMetadata)) {
        throw new Error("Invalid commit metrics: Expected an object.");
    }
    const { name, description, useCase, creator, framework } = repoMetadata;
    if (!name || !description || !useCase || !creator || !framework) {
        throw new Error("Missing required repository metadata fields.");
    }
    return { name, description, useCase, creator, framework };
}
