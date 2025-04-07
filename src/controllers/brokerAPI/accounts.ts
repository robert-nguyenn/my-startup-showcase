import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { getBrokerAlpacaAuth, ALPACA_BASE_URL } from '../../utils/authUtils';

dotenv.config();

const defaultAccountData = {
    contact: {
        email_address: "john.doe@example.com",
        phone_number: "+15556667788",
        street_address: ["123 Main St"],
        city: "San Mateo",
        state: "CA",
        postal_code: "94401"
    },
    identity: {
        tax_id_type: "USA_SSN",
        given_name: "John",
        family_name: "Doe",
        date_of_birth: "1990-01-01",
        tax_id: "xxx-xx-xxxx",
        country_of_citizenship: "USA",
        country_of_birth: "USA",
        country_of_tax_residence: "USA",
        funding_source: ["employment_income"]
    },
    disclosures: {
        is_control_person: false,
        is_affiliated_exchange_or_finra: false,
        is_politically_exposed: false,
        immediate_family_exposed: false
    },
    trusted_contact: {
        given_name: "Trusted",
        family_name: "Contact",
        email_address: "trusted@example.com"
    },
    account_type: "trading",
    agreements: [
        {
            agreement: "customer_agreement",
            signed_at: "2023-01-01T00:00:00Z", // Static example timestamp
            ip_address: "127.0.0.1"
        }
    ],
    documents: [],
    enabled_assets: ["us_equity"],
    beneficiaries: []
};

// Create a new account
export const createAccount = async (req: Request, res: Response) => {
    try {
        const response = await axios.post(
            `${ALPACA_BASE_URL}/accounts`,
            req.body,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        res.status(201).json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

export const getAllAccounts = async(req: Request, res: Response) => {
    try {
        const response = await axios.get(
            `${ALPACA_BASE_URL}/accounts`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Upload owner document for an existing account
export const uploadOwnerDocument = async (req: Request, res: Response) => {
    const { account_id, document_type, document_sub_type, content, mime_type } = req.body;

    try {
        const response = await axios.post(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/documents/upload`,
            {
                document_type,
                document_sub_type,
                content,
                mime_type
            },
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Get account by ID
export const getAccountById = async (req: Request, res: Response) => {
    const { account_id } = req.params;

    try {
        const response = await axios.get(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                },
            }
        );
        res.json(response.data);

    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Delete a Bank Relationship for an Account
export const deleteBankRelationship = async (req: Request, res: Response) => {
    const { account_id, bank_id } = req.params;

    try {
        const response = await axios.delete(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/recipient_banks/${bank_id}`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth()
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Update an Account
export const updateAccount = async (req: Request, res: Response) => {
    const { account_id } = req.params;
    const { identity, disclosures } = req.body;

    try {
        const response = await axios.patch(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}`,
            { identity, disclosures },
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Request to Close a Transfer
export const closeTransfer = async (req: Request, res: Response) => {
    const { account_id, transfer_id } = req.params;

    try {
        const response = await axios.delete(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/transfers/${transfer_id}`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth()
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Retrieve Account Activities
export const getAccountActivities = async (req: Request, res: Response) => {
    const { page_size } = req.query;

    try {
        const response = await axios.get(
            `${ALPACA_BASE_URL}/v1/accounts/activities`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                },
                params: {
                    page_size
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Retrieve ACH Relationships for an Account
export const getAchRelationships = async (req: Request, res: Response) => {
    const { account_id } = req.params;

    try {
        const response = await axios.get(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/ach_relationships`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Create an ACH Relationship
export const createAchRelationship = async (req: Request, res: Response) => {
    const { account_id } = req.params;
    const { bank_account_type } = req.body;

    try {
        const response = await axios.post(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/ach_relationships`,
            { bank_account_type },
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Retrieve Trading Details for an Account
export const getTradingDetails = async (req: Request, res: Response) => {
    const { account_id } = req.params;

    try {
        const response = await axios.get(
            `${ALPACA_BASE_URL}/v1/trading/accounts/${account_id}/account`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Delete an existing ACH relationship
export const deleteAchRelationship = async (req: Request, res: Response) => {
    const { account_id, ach_relationship_id } = req.params;

    try {
        const response = await axios.delete(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/ach_relationships/${ach_relationship_id}`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth()
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Get Pattern Day Trader Status for an Account
export const getPdtStatus = async (req: Request, res: Response) => {
    const { account_id } = req.params;

    try {
        const response = await axios.get(
            `${ALPACA_BASE_URL}/v1/trading/accounts/${account_id}/account/pdt/status`,
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Exercise PDT one-time removal
export const exercisePdtOneTimeRemoval = async (req: Request, res: Response) => {
    const { account_id } = req.params;

    try {
        const response = await axios.post(
            `${ALPACA_BASE_URL}/v1/trading/accounts/${account_id}/account/pdt/one-time-removal`,
            {},
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth(),
                    'Accept': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};

// Close an Account
export const closeAccount = async (req: Request, res: Response) => {
    const { account_id } = req.params;

    try {
        const response = await axios.post(
            `${ALPACA_BASE_URL}/v1/accounts/${account_id}/actions/close`,
            {},
            {
                headers: {
                    Authorization: getBrokerAlpacaAuth()
                }
            }
        );
        res.json(response.data);
    } catch (error: any) {
        res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
    }
};