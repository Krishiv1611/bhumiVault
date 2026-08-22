// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title BhumiVaultRegistry
 * @notice Core Smart Contract for BHUMI-VAULT: Secure Authorization & Fraud Prevention
 *         for Land Ownership Transactions (Smart India Hackathon 2025).
 * @dev Implements:
 *      - 2-Key Authorization (Owner Signature + Government Sub-Registrar Approval)
 *      - Gasless EIP-712 Meta-Transactions for rural citizens without crypto wallets
 *      - Multi-Gate Fraud Policy Engine
 *      - Multi-Lien Bank Mortgage & Multi-Case Court Dispute tracking
 *      - Lost Private Key & Succession Multi-Sig Recovery (Registrar + Judiciary)
 *      - Immutable Chain of Title Provenance & Public Verification Helpers
 */
contract BhumiVaultRegistry is AccessControl, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // -------------------------------------------------------------
    // ROLES DEFINITIONS
    // -------------------------------------------------------------
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant REVENUE_ROLE = keccak256("REVENUE_ROLE");
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");
    bytes32 public constant JUDICIARY_ROLE = keccak256("JUDICIARY_ROLE");

    // EIP-712 TypeHash for Transfer Authorization
    bytes32 public constant TRANSFER_AUTH_TYPEHASH =
        keccak256(
            "TransferAuthorization(string parcelId,address buyer,uint256 saleConsideration,string saleDeedHash,uint256 nonce,uint256 deadline)"
        );

    // EIP-712 TypeHash for Buyer Acceptance (Gasless)
    bytes32 public constant TRANSFER_ACCEPT_TYPEHASH =
        keccak256(
            "TransferAcceptance(string parcelId,address seller,uint256 nonce,uint256 deadline)"
        );

    // -------------------------------------------------------------
    // ENUMS & STRUCTS
    // -------------------------------------------------------------
    enum LandType {
        AGRICULTURAL,
        RESIDENTIAL,
        COMMERCIAL,
        INDUSTRIAL,
        GOVERNMENT_RESERVED
    }

    struct LandParcel {
        string parcelId; // ULPIN (Unique Land Parcel Identification Number)
        string stateCode; // e.g. "MH"
        string district; // e.g. "Pune"
        string taluk; // e.g. "Haveli"
        string surveyNumber; // e.g. "72/1A"
        uint256 areaSqMeters;
        LandType landType;
        address currentOwner;
        string deedDocumentHash; // SHA-256 hash of registered deed document
        string boundaryCoordinatesHash; // Hash of cadastral geo-boundary coordinates
        uint256 activeMortgagesCount; // Number of active bank liens
        uint256 activeDisputesCount; // Number of active court injunctions
        bool isLocked; // Emergency Registrar Freeze flag
        bool exists;
        uint256 creationTimestamp;
        uint256 lastUpdatedTimestamp;
    }

    struct TransferRequest {
        string parcelId;
        address seller;
        address buyer;
        uint256 saleConsideration;
        string saleDeedHash; // SHA-256 hash of newly executed Sale Deed PDF
        bool sellerApproved; // Key 1: Owner digital sign-off
        bool buyerAccepted; // Buyer acceptance
        bool govtApproved; // Key 2: Government Sub-Registrar sign-off
        address registrarApprover;
        uint256 initiatedTimestamp;
        uint256 expiryTimestamp; // Time-to-Live (TTL) for transfer request
        uint256 completedTimestamp;
        bool isActive;
    }

    struct MortgageRecord {
        bytes32 mortgageId;
        string parcelId;
        string bankName;
        string loanReferenceNumber;
        uint256 loanAmount;
        string mortgageDocHash; // SHA-256 hash of Loan Sanction / Hypothecation Deed
        address bankOfficer;
        uint256 timestamp;
        bool isActive;
    }

    struct DisputeRecord {
        bytes32 disputeId;
        string parcelId;
        string courtName;
        string caseNumber;
        string courtOrderHash; // SHA-256 hash of Court Stay / Injunction Order
        string disputeReason;
        address judgeSigner;
        uint256 timestamp;
        bool isActive;
    }

    struct OwnershipRecoveryRequest {
        string parcelId;
        address currentRecordedOwner;
        address proposedNewOwner;
        string recoveryReasonDocHash; // SHA-256 of Succession Certificate / Police KYC Report
        bool registrarApproved;
        bool judiciaryApproved;
        address registrarSigner;
        address judiciarySigner;
        uint256 requestedTimestamp;
        uint256 challengeEndTime;
        bool isFinalized;
        bool isActive;
    }

    struct OwnershipHistoryEntry {
        uint256 historyIndex;
        string parcelId;
        address fromOwner;
        address toOwner;
        string transferType; // "GENESIS_REGISTRATION", "SALE_TRANSFER", "GOVT_ALLOTMENT", "INHERITANCE_RECOVERY"
        string deedDocumentHash;
        address registrarApprover;
        uint256 timestamp;
        uint256 blockNumber;
    }

    struct TitleVerificationStatus {
        bool isCleanTitle;
        address currentOwner;
        bool isMortgaged;
        bool isDisputed;
        bool isLocked;
        uint256 activeMortgageCount;
        uint256 activeDisputeCount;
        uint256 historyCount;
        string currentDeedHash;
    }

    // -------------------------------------------------------------
    // STATE STORAGE
    // -------------------------------------------------------------
    // parcelId => LandParcel
    mapping(string => LandParcel) private _parcels;

    // parcelId => TransferRequest
    mapping(string => TransferRequest) private _activeTransfers;

    // parcelId => mortgageId => MortgageRecord
    mapping(string => mapping(bytes32 => MortgageRecord)) private _mortgages;
    mapping(string => bytes32[]) private _parcelMortgageIds;

    // parcelId => disputeId => DisputeRecord
    mapping(string => mapping(bytes32 => DisputeRecord)) private _disputes;
    mapping(string => bytes32[]) private _parcelDisputeIds;

    // parcelId => OwnershipRecoveryRequest
    mapping(string => OwnershipRecoveryRequest) private _recoveryRequests;

    // parcelId => OwnershipHistoryEntry[]
    mapping(string => OwnershipHistoryEntry[]) private _ownershipHistories;

    // ownerAddress => nonce (for EIP-712 gasless signatures)
    mapping(address => uint256) public userNonces;

    // List of all registered parcel IDs
    string[] private _allParcelIds;

    // -------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------
    event ParcelRegistered(
        string indexed parcelId,
        address indexed owner,
        string surveyNumber,
        string district,
        string deedHash,
        uint256 timestamp
    );

    event TransferInitiated(
        string indexed parcelId,
        address indexed seller,
        address indexed buyer,
        string saleDeedHash,
        uint256 saleConsideration,
        uint256 expiryTimestamp,
        uint256 timestamp
    );

    event TransferBuyerAccepted(
        string indexed parcelId,
        address indexed buyer,
        uint256 timestamp
    );

    event TransferAuthorizedByGovt(
        string indexed parcelId,
        address indexed registrar,
        address seller,
        address buyer,
        uint256 timestamp
    );

    event TransferCommitted(
        string indexed parcelId,
        address indexed previousOwner,
        address indexed newOwner,
        string newDeedHash,
        address registrarApprover,
        uint256 timestamp
    );

    event TransferCancelled(
        string indexed parcelId,
        address indexed cancelledBy,
        string reason,
        uint256 timestamp
    );

    event MortgageApplied(
        string indexed parcelId,
        bytes32 indexed mortgageId,
        string bankName,
        string loanReferenceNumber,
        uint256 loanAmount,
        address indexed bankOfficer,
        uint256 timestamp
    );

    event MortgageReleased(
        string indexed parcelId,
        bytes32 indexed mortgageId,
        string releaseDocHash,
        address indexed bankOfficer,
        uint256 timestamp
    );

    event DisputeInjunctionApplied(
        string indexed parcelId,
        bytes32 indexed disputeId,
        string courtName,
        string caseNumber,
        string courtOrderHash,
        address indexed judgeSigner,
        uint256 timestamp
    );

    event DisputeInjunctionLifted(
        string indexed parcelId,
        bytes32 indexed disputeId,
        string judgmentDocHash,
        address indexed judgeSigner,
        uint256 timestamp
    );

    event OwnershipRecoveryInitiated(
        string indexed parcelId,
        address indexed currentOwner,
        address indexed proposedNewOwner,
        string reasonHash,
        uint256 timestamp
    );

    event OwnershipRecoveryApproved(
        string indexed parcelId,
        address indexed newOwner,
        address indexed registrarApprover,
        address judgeApprover,
        uint256 timestamp
    );

    event OwnershipRecoveryChallengeStarted(
        string indexed parcelId,
        uint256 challengeEndTime,
        uint256 timestamp
    );

    event PropertyLocked(
        string indexed parcelId,
        address indexed lockedBy,
        string reason,
        uint256 timestamp
    );

    event PropertyUnlocked(
        string indexed parcelId,
        address indexed unlockedBy,
        string reason,
        uint256 timestamp
    );

    // -------------------------------------------------------------
    // CONSTRUCTOR
    // -------------------------------------------------------------
    constructor(
        address adminAddress,
        address defaultRegistrar,
        address defaultRevenueOfficer,
        address defaultBankOfficer,
        address defaultJudiciaryOfficer
    ) EIP712("BhumiVaultRegistry", "1.0.0") {
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);

        if (defaultRegistrar != address(0)) {
            _grantRole(REGISTRAR_ROLE, defaultRegistrar);
        }
        if (defaultRevenueOfficer != address(0)) {
            _grantRole(REVENUE_ROLE, defaultRevenueOfficer);
        }
        if (defaultBankOfficer != address(0)) {
            _grantRole(BANK_ROLE, defaultBankOfficer);
        }
        if (defaultJudiciaryOfficer != address(0)) {
            _grantRole(JUDICIARY_ROLE, defaultJudiciaryOfficer);
        }
    }

    // -------------------------------------------------------------
    // GENESIS LAND REGISTRATION
    // -------------------------------------------------------------
    function registerGenesisParcel(
        string calldata parcelId,
        string calldata stateCode,
        string calldata district,
        string calldata taluk,
        string calldata surveyNumber,
        uint256 areaSqMeters,
        LandType landType,
        address initialOwner,
        string calldata deedDocumentHash,
        string calldata boundaryCoordinatesHash
    ) external onlyRole(REVENUE_ROLE) nonReentrant {
        require(bytes(parcelId).length > 0, "BHUMI: Parcel ID cannot be empty");
        require(!_parcels[parcelId].exists, "BHUMI: Parcel ID already exists");
        require(initialOwner != address(0), "BHUMI: Invalid initial owner address");
        require(bytes(deedDocumentHash).length > 0, "BHUMI: Deed document hash required");

        LandParcel memory newParcel = LandParcel({
            parcelId: parcelId,
            stateCode: stateCode,
            district: district,
            taluk: taluk,
            surveyNumber: surveyNumber,
            areaSqMeters: areaSqMeters,
            landType: landType,
            currentOwner: initialOwner,
            deedDocumentHash: deedDocumentHash,
            boundaryCoordinatesHash: boundaryCoordinatesHash,
            activeMortgagesCount: 0,
            activeDisputesCount: 0,
            isLocked: false,
            exists: true,
            creationTimestamp: block.timestamp,
            lastUpdatedTimestamp: block.timestamp
        });

        _parcels[parcelId] = newParcel;
        _allParcelIds.push(parcelId);

        // Record genesis entry in immutable audit trail
        OwnershipHistoryEntry memory historyEntry = OwnershipHistoryEntry({
            historyIndex: 0,
            parcelId: parcelId,
            fromOwner: address(0),
            toOwner: initialOwner,
            transferType: "GENESIS_REGISTRATION",
            deedDocumentHash: deedDocumentHash,
            registrarApprover: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        _ownershipHistories[parcelId].push(historyEntry);

        emit ParcelRegistered(
            parcelId,
            initialOwner,
            surveyNumber,
            district,
            deedDocumentHash,
            block.timestamp
        );
    }

    // -------------------------------------------------------------
    // 2-KEY TRANSFER AUTHORIZATION WORKFLOW & FRAUD GATES
    // -------------------------------------------------------------

    /**
     * @notice Step 1 of Transfer (Standard Web3 Wallet): Owner initiates transfer with on-chain transaction.
     */
    function initiateTransfer(
        string calldata parcelId,
        address buyer,
        uint256 saleConsideration,
        string calldata saleDeedHash
    ) external nonReentrant {
        _validateAndCreateTransfer(parcelId, msg.sender, buyer, saleConsideration, saleDeedHash, 30 days);
    }

    /**
     * @notice Step 1 of Transfer (Gasless Meta-Transaction for Rural Citizens):
     *         Sub-Registrar or Relayer submits owner's signed cryptographic intent.
     */
    function initiateTransferWithSignature(
        string calldata parcelId,
        address seller,
        address buyer,
        uint256 saleConsideration,
        string calldata saleDeedHash,
        uint256 deadline,
        bytes calldata sellerSignature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "BHUMI: Seller signature expired");
        require(seller != address(0), "BHUMI: Invalid seller address");

        // Verify EIP-712 Signature
        uint256 currentNonce = userNonces[seller];
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_AUTH_TYPEHASH,
                keccak256(bytes(parcelId)),
                buyer,
                saleConsideration,
                keccak256(bytes(saleDeedHash)),
                currentNonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, sellerSignature);
        require(recoveredSigner == seller, "BHUMI: FRAUD_DETECTED - Invalid cryptographic signature");

        userNonces[seller] = currentNonce + 1;
        _validateAndCreateTransfer(parcelId, seller, buyer, saleConsideration, saleDeedHash, 30 days);
    }

    function _validateAndCreateTransfer(
        string calldata parcelId,
        address seller,
        address buyer,
        uint256 saleConsideration,
        string calldata saleDeedHash,
        uint256 validityDuration
    ) internal {
        LandParcel storage parcel = _parcels[parcelId];

        // FRAUD CHECK GATE 1: Existence check
        require(parcel.exists, "BHUMI: Parcel does not exist");

        // FRAUD CHECK GATE 2: Seller must be the recorded owner
        require(
            parcel.currentOwner == seller,
            "BHUMI: FRAUD_DETECTED - Caller is not the recorded owner"
        );

        // FRAUD CHECK GATE 3: Valid buyer address
        require(buyer != address(0), "BHUMI: Invalid buyer address");
        require(buyer != seller, "BHUMI: Buyer cannot be the same as seller");

        // FRAUD CHECK GATE 4: Valid document hash
        require(bytes(saleDeedHash).length > 0, "BHUMI: Sale deed SHA-256 hash required");

        // FRAUD CHECK GATE 5: Bank Mortgage Conflict Check
        require(
            parcel.activeMortgagesCount == 0,
            "BHUMI: FRAUD_DETECTED - Active Bank Mortgage Hold exists"
        );

        // FRAUD CHECK GATE 6: Judiciary Dispute Injunction Check
        require(
            parcel.activeDisputesCount == 0,
            "BHUMI: FRAUD_DETECTED - Property has active Court Dispute Injunction"
        );

        // FRAUD CHECK GATE 7: Emergency Freeze Check
        require(!parcel.isLocked, "BHUMI: Property is locked by authorities");

        // Check if there is an active non-expired transfer
        TransferRequest storage activeReq = _activeTransfers[parcelId];
        if (activeReq.isActive) {
            require(block.timestamp > activeReq.expiryTimestamp, "BHUMI: Active transfer request already in progress for this parcel");
        }

        uint256 expiry = block.timestamp + validityDuration;

        _activeTransfers[parcelId] = TransferRequest({
            parcelId: parcelId,
            seller: seller,
            buyer: buyer,
            saleConsideration: saleConsideration,
            saleDeedHash: saleDeedHash,
            sellerApproved: true, // Key 1 provided
            buyerAccepted: false,
            govtApproved: false, // Key 2 pending
            registrarApprover: address(0),
            initiatedTimestamp: block.timestamp,
            expiryTimestamp: expiry,
            completedTimestamp: 0,
            isActive: true
        });

        emit TransferInitiated(
            parcelId,
            seller,
            buyer,
            saleDeedHash,
            saleConsideration,
            expiry,
            block.timestamp
        );
    }

    /**
     * @notice Step 2 of Transfer: Buyer acknowledges and accepts transfer terms.
     */
    function buyerAcceptTransfer(string calldata parcelId) external nonReentrant {
        TransferRequest storage req = _activeTransfers[parcelId];
        require(req.isActive, "BHUMI: No active transfer request");
        require(block.timestamp <= req.expiryTimestamp, "BHUMI: Transfer request has expired");
        require(
            req.buyer == msg.sender,
            "BHUMI: Caller is not the designated buyer"
        );
        require(!req.buyerAccepted, "BHUMI: Buyer already accepted transfer");

        req.buyerAccepted = true;

        emit TransferBuyerAccepted(parcelId, msg.sender, block.timestamp);
    }

    /**
     * @notice Step 2 of Transfer (Gasless Meta-Transaction for Rural Citizens):
     *         Buyer digitally accepts the transfer via signature.
     */
    function buyerAcceptTransferWithSignature(
        string calldata parcelId,
        uint256 deadline,
        bytes calldata buyerSignature
    ) external nonReentrant {
        TransferRequest storage req = _activeTransfers[parcelId];
        require(req.isActive, "BHUMI: No active transfer request");
        require(block.timestamp <= req.expiryTimestamp, "BHUMI: Transfer request has expired");
        require(block.timestamp <= deadline, "BHUMI: Buyer signature expired");
        require(!req.buyerAccepted, "BHUMI: Buyer already accepted transfer");

        // Verify EIP-712 Signature
        uint256 currentNonce = userNonces[req.buyer];
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_ACCEPT_TYPEHASH,
                keccak256(bytes(parcelId)),
                req.seller,
                currentNonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, buyerSignature);
        require(recoveredSigner == req.buyer, "BHUMI: FRAUD_DETECTED - Invalid cryptographic signature from buyer");

        userNonces[req.buyer] = currentNonce + 1;
        req.buyerAccepted = true;

        emit TransferBuyerAccepted(parcelId, req.buyer, block.timestamp);
    }

    /**
     * @notice Step 3 & 4 of Transfer: Government Sub-Registrar authorizes and commits transfer.
     * @dev Enforces 2-Key authorization (Owner Key + Govt Key) AND Buyer Acceptance.
     */
    function authorizeAndCommitTransfer(
        string calldata parcelId
    ) external onlyRole(REGISTRAR_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        TransferRequest storage req = _activeTransfers[parcelId];

        // Verification checks
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(req.isActive, "BHUMI: No active transfer request to authorize");
        require(block.timestamp <= req.expiryTimestamp, "BHUMI: Transfer request has expired");
        require(req.sellerApproved, "BHUMI: Missing Seller Authorization (Key 1)");
        require(req.buyerAccepted, "BHUMI: Buyer must accept transfer before registrar authorization");
        require(req.seller == parcel.currentOwner, "BHUMI: Seller mismatch with current owner");

        // RE-RUN FRAUD CHECK GATES
        require(parcel.activeMortgagesCount == 0, "BHUMI: FRAUD_DETECTED - Property has active Bank Mortgage");
        require(parcel.activeDisputesCount == 0, "BHUMI: FRAUD_DETECTED - Property has active Court Dispute");
        require(!parcel.isLocked, "BHUMI: Property is locked by authorities");

        address previousOwner = parcel.currentOwner;
        address newOwner = req.buyer;
        string memory newDeedHash = req.saleDeedHash;

        // Apply Key 2 (Government Authorization)
        req.govtApproved = true;
        req.registrarApprover = msg.sender;
        req.completedTimestamp = block.timestamp;
        req.isActive = false;

        // Mutate Ownership on-chain
        parcel.currentOwner = newOwner;
        parcel.deedDocumentHash = newDeedHash;
        parcel.lastUpdatedTimestamp = block.timestamp;

        // Record in immutable history audit trail
        uint256 historyCount = _ownershipHistories[parcelId].length;
        OwnershipHistoryEntry memory newEntry = OwnershipHistoryEntry({
            historyIndex: historyCount,
            parcelId: parcelId,
            fromOwner: previousOwner,
            toOwner: newOwner,
            transferType: "SALE_TRANSFER",
            deedDocumentHash: newDeedHash,
            registrarApprover: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        _ownershipHistories[parcelId].push(newEntry);

        emit TransferAuthorizedByGovt(
            parcelId,
            msg.sender,
            previousOwner,
            newOwner,
            block.timestamp
        );

        emit TransferCommitted(
            parcelId,
            previousOwner,
            newOwner,
            newDeedHash,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Cancels an active transfer request (callable by Seller, Registrar, or any party after expiry).
     */
    function cancelTransferRequest(
        string calldata parcelId,
        string calldata reason
    ) external nonReentrant {
        TransferRequest storage req = _activeTransfers[parcelId];
        require(req.isActive, "BHUMI: No active transfer request");
        require(
            msg.sender == req.seller ||
                msg.sender == req.buyer ||
                hasRole(REGISTRAR_ROLE, msg.sender) ||
                block.timestamp > req.expiryTimestamp,
            "BHUMI: Unauthorized to cancel transfer"
        );

        req.isActive = false;

        emit TransferCancelled(parcelId, msg.sender, reason, block.timestamp);
    }

    // -------------------------------------------------------------
    // BANK NODE: MULTI-MORTGAGE / ENCUMBRANCE MANAGEMENT
    // -------------------------------------------------------------

    function applyMortgage(
        string calldata parcelId,
        string calldata bankName,
        string calldata loanReferenceNumber,
        uint256 loanAmount,
        string calldata mortgageDocHash
    ) external onlyRole(BANK_ROLE) nonReentrant returns (bytes32 mortgageId) {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(!_activeTransfers[parcelId].isActive, "BHUMI: Cannot mortgage parcel during active transfer");

        mortgageId = keccak256(
            abi.encodePacked(parcelId, bankName, loanReferenceNumber, block.timestamp)
        );

        parcel.activeMortgagesCount += 1;
        parcel.lastUpdatedTimestamp = block.timestamp;

        _mortgages[parcelId][mortgageId] = MortgageRecord({
            mortgageId: mortgageId,
            parcelId: parcelId,
            bankName: bankName,
            loanReferenceNumber: loanReferenceNumber,
            loanAmount: loanAmount,
            mortgageDocHash: mortgageDocHash,
            bankOfficer: msg.sender,
            timestamp: block.timestamp,
            isActive: true
        });

        _parcelMortgageIds[parcelId].push(mortgageId);

        emit MortgageApplied(
            parcelId,
            mortgageId,
            bankName,
            loanReferenceNumber,
            loanAmount,
            msg.sender,
            block.timestamp
        );
    }

    function releaseMortgage(
        string calldata parcelId,
        bytes32 mortgageId,
        string calldata releaseDocHash
    ) external onlyRole(BANK_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        MortgageRecord storage record = _mortgages[parcelId][mortgageId];
        require(record.isActive, "BHUMI: Mortgage record not found or already released");

        record.isActive = false;
        if (parcel.activeMortgagesCount > 0) {
            parcel.activeMortgagesCount -= 1;
        }
        parcel.lastUpdatedTimestamp = block.timestamp;

        emit MortgageReleased(parcelId, mortgageId, releaseDocHash, msg.sender, block.timestamp);
    }

    // -------------------------------------------------------------
    // JUDICIARY / COURT NODE: MULTI-DISPUTE INJUNCTION MANAGEMENT
    // -------------------------------------------------------------

    function applyDisputeInjunction(
        string calldata parcelId,
        string calldata courtName,
        string calldata caseNumber,
        string calldata courtOrderHash,
        string calldata disputeReason
    ) external onlyRole(JUDICIARY_ROLE) nonReentrant returns (bytes32 disputeId) {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");

        disputeId = keccak256(abi.encodePacked(parcelId, courtName, caseNumber));

        parcel.activeDisputesCount += 1;
        parcel.lastUpdatedTimestamp = block.timestamp;

        // Automatically cancel any active transfer request due to court injunction
        if (_activeTransfers[parcelId].isActive) {
            _activeTransfers[parcelId].isActive = false;
            emit TransferCancelled(
                parcelId,
                msg.sender,
                "Cancelled due to Judicial Injunction Order",
                block.timestamp
            );
        }

        _disputes[parcelId][disputeId] = DisputeRecord({
            disputeId: disputeId,
            parcelId: parcelId,
            courtName: courtName,
            caseNumber: caseNumber,
            courtOrderHash: courtOrderHash,
            disputeReason: disputeReason,
            judgeSigner: msg.sender,
            timestamp: block.timestamp,
            isActive: true
        });

        _parcelDisputeIds[parcelId].push(disputeId);

        emit DisputeInjunctionApplied(
            parcelId,
            disputeId,
            courtName,
            caseNumber,
            courtOrderHash,
            msg.sender,
            block.timestamp
        );
    }

    function liftDisputeInjunction(
        string calldata parcelId,
        bytes32 disputeId,
        string calldata judgmentDocHash
    ) external onlyRole(JUDICIARY_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        DisputeRecord storage record = _disputes[parcelId][disputeId];
        require(record.isActive, "BHUMI: Dispute record not found or already resolved");

        record.isActive = false;
        if (parcel.activeDisputesCount > 0) {
            parcel.activeDisputesCount -= 1;
        }
        parcel.lastUpdatedTimestamp = block.timestamp;

        emit DisputeInjunctionLifted(parcelId, disputeId, judgmentDocHash, msg.sender, block.timestamp);
    }

    // -------------------------------------------------------------
    // GOVERNMENT-ASSISTED LOST PRIVATE KEY / SUCCESSION RECOVERY
    // (Multi-Sig: Sub-Registrar + District Court Judge)
    // -------------------------------------------------------------

    /**
     * @notice Initiates a government-assisted title recovery for lost keys or deceased inheritance.
     */
    function initiateOwnershipRecovery(
        string calldata parcelId,
        address proposedNewOwner,
        string calldata recoveryReasonDocHash
    ) external nonReentrant {
        require(
            hasRole(REGISTRAR_ROLE, msg.sender) || hasRole(JUDICIARY_ROLE, msg.sender),
            "BHUMI: Only Registrar or Judiciary can initiate recovery"
        );

        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(proposedNewOwner != address(0), "BHUMI: Invalid proposed new owner address");
        require(proposedNewOwner != parcel.currentOwner, "BHUMI: Proposed owner matches current owner");
        
        require(!_recoveryRequests[parcelId].isActive, "BHUMI: Active recovery request already exists");
        require(!parcel.isLocked, "BHUMI: Cannot initiate recovery on frozen property");

        bool fromRegistrar = hasRole(REGISTRAR_ROLE, msg.sender);

        _recoveryRequests[parcelId] = OwnershipRecoveryRequest({
            parcelId: parcelId,
            currentRecordedOwner: parcel.currentOwner,
            proposedNewOwner: proposedNewOwner,
            recoveryReasonDocHash: recoveryReasonDocHash,
            registrarApproved: fromRegistrar,
            judiciaryApproved: !fromRegistrar,
            registrarSigner: fromRegistrar ? msg.sender : address(0),
            judiciarySigner: !fromRegistrar ? msg.sender : address(0),
            requestedTimestamp: block.timestamp,
            challengeEndTime: 0,
            isFinalized: false,
            isActive: true
        });

        emit OwnershipRecoveryInitiated(
            parcelId,
            parcel.currentOwner,
            proposedNewOwner,
            recoveryReasonDocHash,
            block.timestamp
        );
    }

    /**
     * @notice Approves ownership recovery. When both Registrar + Judge have signed, the 30-day challenge period begins.
     */
    function approveOwnershipRecovery(
        string calldata parcelId
    ) external nonReentrant {
        OwnershipRecoveryRequest storage req = _recoveryRequests[parcelId];
        require(req.isActive, "BHUMI: No active recovery request");
        require(req.challengeEndTime == 0, "BHUMI: Challenge period already started");

        LandParcel storage parcel = _parcels[parcelId];
        require(!parcel.isLocked, "BHUMI: Cannot approve recovery on frozen property");

        if (hasRole(REGISTRAR_ROLE, msg.sender) && !req.registrarApproved) {
            req.registrarApproved = true;
            req.registrarSigner = msg.sender;
        } else if (hasRole(JUDICIARY_ROLE, msg.sender) && !req.judiciaryApproved) {
            req.judiciaryApproved = true;
            req.judiciarySigner = msg.sender;
        } else {
            revert("BHUMI: Unauthorized or already approved by your authority");
        }

        // Check if Multi-Sig threshold reached (Both Registrar + Judge Approved)
        if (req.registrarApproved && req.judiciaryApproved) {
            // Start 30 day challenge period
            req.challengeEndTime = block.timestamp + 30 days;
            
            emit OwnershipRecoveryChallengeStarted(
                parcelId,
                req.challengeEndTime,
                block.timestamp
            );
        }
    }

    /**
     * @notice Finalizes ownership recovery after the 30-day challenge period ends.
     */
    function finalizeOwnershipRecovery(string calldata parcelId) external nonReentrant {
        OwnershipRecoveryRequest storage req = _recoveryRequests[parcelId];
        require(req.isActive, "BHUMI: No active recovery request");
        require(req.registrarApproved && req.judiciaryApproved, "BHUMI: Approvals pending");
        require(req.challengeEndTime > 0, "BHUMI: Challenge period not started");
        require(block.timestamp >= req.challengeEndTime, "BHUMI: 30-day Challenge period is still active");
        require(!req.isFinalized, "BHUMI: Already finalized");

        LandParcel storage parcel = _parcels[parcelId];
        require(!parcel.isLocked, "BHUMI: Cannot finalize on explicitly frozen property");

        address previousOwner = parcel.currentOwner;
        address newOwner = req.proposedNewOwner;

        parcel.currentOwner = newOwner;
        parcel.lastUpdatedTimestamp = block.timestamp;
        req.isActive = false;
        req.isFinalized = true;

        // Log in immutable audit trail
        uint256 historyCount = _ownershipHistories[parcelId].length;
        OwnershipHistoryEntry memory newEntry = OwnershipHistoryEntry({
            historyIndex: historyCount,
            parcelId: parcelId,
            fromOwner: previousOwner,
            toOwner: newOwner,
            transferType: "INHERITANCE_RECOVERY",
            deedDocumentHash: req.recoveryReasonDocHash,
            registrarApprover: req.registrarSigner,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        _ownershipHistories[parcelId].push(newEntry);

        emit OwnershipRecoveryApproved(
            parcelId,
            newOwner,
            req.registrarSigner,
            req.judiciarySigner,
            block.timestamp
        );

        emit TransferCommitted(
            parcelId,
            previousOwner,
            newOwner,
            req.recoveryReasonDocHash,
            req.registrarSigner,
            block.timestamp
        );
    }

    // -------------------------------------------------------------
    // REGISTRAR EMERGENCY CONTROLS
    // -------------------------------------------------------------

    function freezeProperty(
        string calldata parcelId,
        string calldata reason
    ) external onlyRole(REGISTRAR_ROLE) {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        parcel.isLocked = true;
        emit PropertyLocked(parcelId, msg.sender, reason, block.timestamp);
    }

    function unfreezeProperty(
        string calldata parcelId,
        string calldata reason
    ) external onlyRole(REGISTRAR_ROLE) {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        parcel.isLocked = false;
        emit PropertyUnlocked(parcelId, msg.sender, reason, block.timestamp);
    }

    // -------------------------------------------------------------
    // QUERY & VERIFICATION FUNCTIONS
    // -------------------------------------------------------------

    function getParcel(string calldata parcelId) external view returns (LandParcel memory) {
        require(_parcels[parcelId].exists, "BHUMI: Parcel not found");
        return _parcels[parcelId];
    }

    function getOwnershipHistory(
        string calldata parcelId
    ) external view returns (OwnershipHistoryEntry[] memory) {
        require(_parcels[parcelId].exists, "BHUMI: Parcel not found");
        return _ownershipHistories[parcelId];
    }

    function getActiveTransfer(
        string calldata parcelId
    ) external view returns (TransferRequest memory) {
        return _activeTransfers[parcelId];
    }

    function getMortgage(
        string calldata parcelId,
        bytes32 mortgageId
    ) external view returns (MortgageRecord memory) {
        return _mortgages[parcelId][mortgageId];
    }

    function getParcelMortgageIds(
        string calldata parcelId
    ) external view returns (bytes32[] memory) {
        return _parcelMortgageIds[parcelId];
    }

    function getDispute(
        string calldata parcelId,
        bytes32 disputeId
    ) external view returns (DisputeRecord memory) {
        return _disputes[parcelId][disputeId];
    }

    function getParcelDisputeIds(
        string calldata parcelId
    ) external view returns (bytes32[] memory) {
        return _parcelDisputeIds[parcelId];
    }

    function getRecoveryRequest(
        string calldata parcelId
    ) external view returns (OwnershipRecoveryRequest memory) {
        return _recoveryRequests[parcelId];
    }

    /**
     * @notice Fast title verification helper for public, banks, and buyers.
     */
    function verifyTitle(
        string calldata parcelId
    ) external view returns (TitleVerificationStatus memory status) {
        LandParcel memory parcel = _parcels[parcelId];
        if (!parcel.exists) {
            return TitleVerificationStatus(false, address(0), false, false, false, 0, 0, 0, "");
        }

        bool hasMortgage = parcel.activeMortgagesCount > 0;
        bool hasDispute = parcel.activeDisputesCount > 0;
        bool clean = (!hasMortgage && !hasDispute && !parcel.isLocked);

        return TitleVerificationStatus({
            isCleanTitle: clean,
            currentOwner: parcel.currentOwner,
            isMortgaged: hasMortgage,
            isDisputed: hasDispute,
            isLocked: parcel.isLocked,
            activeMortgageCount: parcel.activeMortgagesCount,
            activeDisputeCount: parcel.activeDisputesCount,
            historyCount: _ownershipHistories[parcelId].length,
            currentDeedHash: parcel.deedDocumentHash
        });
    }

    function verifyDeedHash(
        string calldata parcelId,
        string calldata testHash
    ) external view returns (bool isValid) {
        LandParcel memory parcel = _parcels[parcelId];
        if (!parcel.exists) return false;
        return (keccak256(bytes(parcel.deedDocumentHash)) == keccak256(bytes(testHash)));
    }

    function getTotalParcelsCount() external view returns (uint256) {
        return _allParcelIds.length;
    }

    function getParcelIdByIndex(uint256 index) external view returns (string memory) {
        require(index < _allParcelIds.length, "BHUMI: Index out of bounds");
        return _allParcelIds[index];
    }
}
