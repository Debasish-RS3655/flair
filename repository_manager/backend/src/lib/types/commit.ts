// Type declarations for the commit schema
// Debashish Buragohain

import { zkmlDeserialized } from "../../zkml/types/types";

// merger commit cannot be created as an Nft because it is the system that creates the merger commit
export type CommitStatusGen = 'PENDING' | 'MERGED' | 'REJECTED';

// metadata of the commit for uploading in the Nft
export interface CommitNftMetdata {
    commitHash: string;                 // this commit's hash
    branchName: string;                 // name of the branch the commit is created to
    branchHash: string;                 // branch hash of the committed commit
    repositoryHash: string;
    repositoryName: string;
    repositoryOwner: string;            // wallet address of the repository owner
    baseModelHash: string;              // hash of the base model
    baseModelUri: string;               // uri of the base model
    status: CommitStatusGen;            // even pending commits can be converted into Nft
    // sourceCommit: string;               // the merger commit on which this commit was created
    // mergedCommit: string | 'N/A';       // in case it is a rejected commit
    committer: string;                  // wallet address of the committer
    paramHash: string;                  // hash of the parameters for this commit
    message: string;
    // messageIfRejected: string | 'N/A';  // The rejection message of the commit in case it was rejected
    createdAt: string;                  // ISO string of when the commit was created
    localMetrics: commitMetrics;
    // mergedMetrics: commitMetrics | 'N/A';   // there will be no merged commits in case the commit was rejected
}

export interface commitParameters {
    params: string        // the parameters of the model will be sent in the latest versions now
}

// the metrics associated with the model are defined this way
export interface commitMetrics {
    accuracy: number | null,
    loss: number | null,
    val_loss: number | null,
    train_loss: number | null,
    precision: number | null,
    recall: number | null,
    f1: number | null,
    learning_rate: number | null,
    notes: string | null
}

export type RejectedCommit = {
    commit: string,     // the commit hash of the rejected commit
    message: string     // the rejection message
}

// array of the rejected commits
export type RejectedCommits = RejectedCommit[];