// Shared folder route for handling the shared folder API
// Debashish Buragohain

import { Router, raw } from "express";
import * as sharedFolderController from '../controllers/sharedFolder.controller.js';

const sharedFolderRouter = Router();

// Current metrics of the shared folder
sharedFolderRouter.get('/metrics', sharedFolderController.getMetrics);

// The first route is the get route for the current shared folder
sharedFolderRouter.get('/pull', sharedFolderController.pullSharedFolder);

// Upload metrics (binary) to shared folder
sharedFolderRouter.put(
    '/files/keras/:committerAddress/:key',
    raw({ type: 'application/octet-stream', limit: '50mb' }),
    sharedFolderController.uploadKerasMetrics
);

// The pickled model is stored in this route
sharedFolderRouter.put('/files/:committerAddress',
    raw({ type: 'application/octet-stream', limit: '50mb' }),
    sharedFolderController.uploadModel
);

// Binary file routes
// The route for the keras folder (metrics before and after aggregation)
sharedFolderRouter.get("/files/keras/:committerAddress/:key(*)", sharedFolderController.getKerasFile);

// Get list routes
// Listing the keys for metrics before and after aggregation
sharedFolderRouter.get('/files/list/keras/:committerAddress', sharedFolderController.listKerasFiles);

// The keys for the saved model folder contains a list of all the model.pkl files with the committer addresses as their names
sharedFolderRouter.get('/files/list', sharedFolderController.listAllFiles);

// The route for the saved model for the user
sharedFolderRouter.get("/files/:committerAddress(*)", sharedFolderController.getModelFile);

// Delete routes here
sharedFolderRouter.delete("/files/keras/:committerAddress/:key(*)", sharedFolderController.deleteKerasFile);

sharedFolderRouter.delete("/files/:committerAddress(*)", sharedFolderController.deleteModelFile);

export { sharedFolderRouter }