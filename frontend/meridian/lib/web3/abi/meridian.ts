// ABI générée depuis backend/artifacts/contracts/Meridian.sol/Meridian.json
export const meridianAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "accountAddress",
        "type": "address"
      }
    ],
    "name": "AddressIsSanctioned",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "bits",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "SafeCastOverflowedUintDowncast",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "userAddress",
        "type": "address"
      }
    ],
    "name": "AddressSanctioned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOracle",
        "type": "address"
      }
    ],
    "name": "ContainerPositionOracleAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.ContainerPositionStatus",
        "name": "status",
        "type": "uint8"
      }
    ],
    "name": "ContainerPositionReported",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "ExemptAddressAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "ExemptAddressRemoved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.Currency",
        "name": "currency",
        "type": "uint8"
      }
    ],
    "name": "FundsDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.Currency",
        "name": "currency",
        "type": "uint8"
      }
    ],
    "name": "FundsWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "newMeridianNFT",
        "type": "address"
      }
    ],
    "name": "MeridianNFTAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "newMockOracle",
        "type": "address"
      }
    ],
    "name": "MockSanctionsOracleAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "MockSanctionsToggled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "SanctionsCheckToggled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOracle",
        "type": "address"
      }
    ],
    "name": "SanctionsOracleAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "enum InternalFunctions.Currency",
        "name": "currency",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      }
    ],
    "name": "TokenAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "TransactionAborted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "TransactionCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "TransactionCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "TransactionDateOverdue",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.UserType",
        "name": "userType",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "userAddress",
        "type": "address"
      }
    ],
    "name": "TransactionDetailsSaved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      }
    ],
    "name": "TransactionInitialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.UserType",
        "name": "userType",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "userAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "TransactionNFTMinted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.UserType",
        "name": "userType",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "userAddress",
        "type": "address"
      }
    ],
    "name": "TransactionPartiallySigned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "seller",
        "type": "address"
      }
    ],
    "name": "TransactionSigned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.Currency",
        "name": "currency",
        "type": "uint8"
      }
    ],
    "name": "partialAmountRefunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum InternalFunctions.Currency",
        "name": "currency",
        "type": "uint8"
      }
    ],
    "name": "totalAmountRefunded",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "addExemptAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "checkSanctionsEnabled",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "containerPositionOracleAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "_billNumber",
        "type": "string"
      }
    ],
    "name": "createTransaction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "depositFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "getTransaction",
    "outputs": [
      {
        "components": [
          {
            "internalType": "enum InternalFunctions.WorkflowStatus",
            "name": "workflowStatus",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.Currency",
            "name": "currency",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionCondition",
            "name": "transactionCondition",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionModel",
            "name": "transactionModel",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.AdvancePaymentMode",
            "name": "advancePaymentMode",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.ContainerPositionStatus",
            "name": "containerPositionStatus",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.UserType",
            "name": "currentEditor",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "signedByBuyer",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "signedBySeller",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "depositCompleted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "partialWithdrawalCompleted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "withdrawalCompleted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "totalAmountRefunded",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "partialAmountRefunded",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "buyerNFTMinted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "sellerNFTMinted",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "buyerSanctioned",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "sellerSanctioned",
            "type": "bool"
          },
          {
            "components": [
              {
                "internalType": "enum InternalFunctions.UserType",
                "name": "userType",
                "type": "uint8"
              },
              {
                "internalType": "address",
                "name": "userAddress",
                "type": "address"
              }
            ],
            "internalType": "struct InternalFunctions.User",
            "name": "buyer",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "enum InternalFunctions.UserType",
                "name": "userType",
                "type": "uint8"
              },
              {
                "internalType": "address",
                "name": "userAddress",
                "type": "address"
              }
            ],
            "internalType": "struct InternalFunctions.User",
            "name": "seller",
            "type": "tuple"
          },
          {
            "internalType": "uint40",
            "name": "transactionCancellingDate",
            "type": "uint40"
          },
          {
            "internalType": "uint128",
            "name": "advanceAmount",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "totalAmount",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "depositedAmount",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "pendingWithdrawalAmount",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "refundAmount",
            "type": "uint128"
          },
          {
            "internalType": "string",
            "name": "billNumber",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "containerReference",
            "type": "string"
          }
        ],
        "internalType": "struct InternalFunctions.Transaction",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "enum InternalFunctions.Currency",
            "name": "currency",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionCondition",
            "name": "transactionCondition",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionModel",
            "name": "transactionModel",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.AdvancePaymentMode",
            "name": "advancePaymentMode",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "advanceAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "transactionCancellingDate",
            "type": "uint256"
          }
        ],
        "internalType": "struct InternalFunctions.TransactionDetailsInput",
        "name": "_details",
        "type": "tuple"
      },
      {
        "internalType": "string",
        "name": "_billNumber",
        "type": "string"
      }
    ],
    "name": "initializeTransaction",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "internalID",
    "outputs": [
      {
        "internalType": "uint96",
        "name": "",
        "type": "uint96"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isExempt",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "meridianNFTAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "mintTransactionNFTBuyer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "mintTransactionNFTSeller",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "mockSanctionsEnabled",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "mockSanctionsOracleAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_account",
        "type": "address"
      }
    ],
    "name": "removeExemptAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      },
      {
        "internalType": "enum InternalFunctions.ContainerPositionStatus",
        "name": "_status",
        "type": "uint8"
      }
    ],
    "name": "reportContainerPosition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "rollbackDeposit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sanctionsOracleAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      },
      {
        "components": [
          {
            "internalType": "enum InternalFunctions.Currency",
            "name": "currency",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionCondition",
            "name": "transactionCondition",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionModel",
            "name": "transactionModel",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.AdvancePaymentMode",
            "name": "advancePaymentMode",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "advanceAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "transactionCancellingDate",
            "type": "uint256"
          }
        ],
        "internalType": "struct InternalFunctions.TransactionDetailsInput",
        "name": "_details",
        "type": "tuple"
      }
    ],
    "name": "saveTransactionDetailsBuyer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "_containerReference",
        "type": "string"
      },
      {
        "components": [
          {
            "internalType": "enum InternalFunctions.Currency",
            "name": "currency",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionCondition",
            "name": "transactionCondition",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.TransactionModel",
            "name": "transactionModel",
            "type": "uint8"
          },
          {
            "internalType": "enum InternalFunctions.AdvancePaymentMode",
            "name": "advancePaymentMode",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "advanceAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "transactionCancellingDate",
            "type": "uint256"
          }
        ],
        "internalType": "struct InternalFunctions.TransactionDetailsInput",
        "name": "_details",
        "type": "tuple"
      }
    ],
    "name": "saveTransactionDetailsSeller",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_containerPositionOracle",
        "type": "address"
      }
    ],
    "name": "setContainerPositionOracleAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_meridianNFT",
        "type": "address"
      }
    ],
    "name": "setMeridianNFTAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_mockSanctionsOracle",
        "type": "address"
      }
    ],
    "name": "setMockSanctionsOracleAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_newOwner",
        "type": "address"
      }
    ],
    "name": "setNewOwner",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_sanctionsOracle",
        "type": "address"
      }
    ],
    "name": "setSanctionsOracleAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "enum InternalFunctions.Currency",
        "name": "_currency",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "_tokenAddress",
        "type": "address"
      }
    ],
    "name": "setTokenAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "signTransactionBuyer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "signTransactionSeller",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bool",
        "name": "_actualSetting",
        "type": "bool"
      }
    ],
    "name": "toggleMockSanctionsOracle",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bool",
        "name": "_actualSetting",
        "type": "bool"
      }
    ],
    "name": "toggleSanctionsCheck",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "enum InternalFunctions.Currency",
        "name": "",
        "type": "uint8"
      }
    ],
    "name": "tokenAddresses",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_transactionID",
        "type": "bytes32"
      }
    ],
    "name": "withdrawFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      }
    ],
    "name": "BuyerIsNowEditor",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "transactionID",
        "type": "bytes32"
      }
    ],
    "name": "SellerIsNowEditor",
    "type": "event"
  }
] as const;
