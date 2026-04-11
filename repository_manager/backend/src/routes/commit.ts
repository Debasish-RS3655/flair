import { Router } from 'express';
import { sharedFolderRouter } from './sharedFolder.js';
import { paramsUploader, zkmlUploader } from '../lib/multer/index.js';
import * as commitController from '../controllers/commit.controller.js';
import { nftWalletLinkGate } from '../middleware/auth/nftWalletLinkGate.js';

const commitRouter = Router();

// Get all commits for a specific branch
commitRouter.get('/', commitController.getAllCommits);

// Complete info for the commit for pulling it
commitRouter.get('/hash/:commitHash/pull', commitController.getCommitForPull);

// Basic details of a commit
commitRouter.get('/hash/:commitHash', commitController.getCommitByHash);

// Pull the latest commit
commitRouter.get('/latest', commitController.getLatestCommit);

// STEP 1: Initiate commit creation session
commitRouter.post('/create/initiate', commitController.initiateCommitSession);

// STEP 2: Check ZKML proof uniqueness and issue ZKML token
commitRouter.post('/create/zkml-check', commitController.checkZKMLProof);

// STEP 3: Upload ZKML Proofs (Pre-Commit) - Binary files
commitRouter.post('/create/zkml-upload', zkmlUploader, commitController.uploadZKMLProofs);

// STEP 3.5: Upload Model Parameters (Binary File)
commitRouter.post('/create/params-upload', paramsUploader, commitController.uploadParameters);

// STEP 4: Finalize Commit (Atomic Creation)
commitRouter.post('/create/finalize', commitController.finalizeCommit);

// The shared folder creation route goes here
commitRouter.use('/sharedFolder/', sharedFolderRouter);

// Commit nft conversion route
commitRouter.post('/hash/:commitHash/createNft', nftWalletLinkGate, commitController.createCommitNft);

export { commitRouter };
