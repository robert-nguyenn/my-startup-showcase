import { Router } from 'express';
import {
    createAccount,
    uploadOwnerDocument,
    getAccountById,
    deleteBankRelationship,
    updateAccount,
    closeTransfer,
    getAccountActivities,
    getAchRelationships,
    createAchRelationship,
    getTradingDetails,
    deleteAchRelationship,
    getPdtStatus,
    exercisePdtOneTimeRemoval,
    closeAccount,
    getAllAccounts
} from '../../controllers/brokerAPI/accounts';

const router = Router();

router.post('/', createAccount);
router.get('/', getAllAccounts)
router.post('/:account_id/documents/upload', uploadOwnerDocument);
router.get('/:account_id', getAccountById);
router.delete('/:account_id/recipient_banks/:bank_id', deleteBankRelationship);
router.patch('/:account_id', updateAccount);
router.delete('/:account_id/transfers/:transfer_id', closeTransfer);
router.get('/activities', getAccountActivities);
router.get('/:account_id/ach_relationships', getAchRelationships);
router.post('/:account_id/ach_relationships', createAchRelationship);
router.get('/trading/:account_id/account', getTradingDetails);
router.delete('/:account_id/ach_relationships/:ach_relationship_id', deleteAchRelationship);
router.get('/trading/:account_id/account/pdt/status', getPdtStatus);
router.post('/trading/:account_id/account/pdt/one-time-removal', exercisePdtOneTimeRemoval);
router.post('/:account_id/actions/close', closeAccount);

export default router;