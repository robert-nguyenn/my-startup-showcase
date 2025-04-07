import express from 'express';
import { getAllUsers, getUserById, createUser, updateUser, deleteUser } from '../../controllers/userAPI/userController'

const router = express.Router();

// @routes GET /users
router.get('/users', getAllUsers);

// @routes GET /users/:userId
router.get('/users/:userId', getUserById);

// @routes POST /users
router.post('/users', createUser);

// @routes PUT /users/:userId
router.put('/users/:userId', updateUser);

// @routes DELETE /users/:userId
router.delete('/users/:userId', deleteUser);

export default router;