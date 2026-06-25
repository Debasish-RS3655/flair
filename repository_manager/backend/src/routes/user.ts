// The user data manager for Flair managing RUD operations
// Debashish Buragohain

import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';

const userRouter = Router();

// Get user by username
userRouter.get('/username/:username', userController.getUserByUsername);

// Get user by wallet
userRouter.get('/user/:wallet', userController.getUserByWallet);

// Get current user profile
userRouter.get('/profile', userController.getUserProfile);

// Update user
userRouter.put('/update', userController.updateUser);

// Delete user (also deletes all his repositories)
userRouter.delete('/delete', userController.deleteUser);

export { userRouter };
