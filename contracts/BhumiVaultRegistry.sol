// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BhumiVaultRegistry
 * @notice Core Smart Contract for BHUMI-VAULT: Secure Authorization & Fraud Prevention
 *         for Land Ownership Transactions (Smart India Hackathon 2025).
 * @dev Implements 2-key authorization (Owner + Registrar), multi-party fraud detection gates,
 *      bank mortgage liens, court dispute freezes, and tamper-evident ownership audit trails.
 */
contract BhumiVaultRegistry is AccessControl, ReentrancyGuard {
    // -------------------------------------------------------------
    // ROLES DEFINITIONS
    // -------------------------------------------------------------
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant REVENUE_ROLE = keccak256("REVENUE_ROLE");
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");
    bytes32 public constant JUDICIARY_ROLE = keccak256("JUDICIARY_ROLE");

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
        bool isMortgaged; // Active Bank Encumbrance flag
        bool isDisputed; // Active Judiciary Court Dispute Injunction flag
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
        bool buyerAccepted;
        bool govtApproved; // Key 2: Government Sub-Registrar sign-off
        address registrarApprover;
        uint256 initiatedTimestamp;
        uint256 completedTimestamp;
        bool isActive;
    }

    struct MortgageRecord {
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
        string parcelId;
        string courtName;
        string caseNumber;
        string courtOrderHash; // SHA-256 hash of Court Stay / Injunction Order
        string disputeReason;
        address judgeSigner;
        uint256 timestamp;
        bool isActive;
    }

    struct OwnershipHistoryEntry {
        uint256 historyIndex;
        string parcelId;
        address fromOwner;
        address toOwner;
        string transferType; // "GENESIS_REGISTRATION", "SALE_TRANSFER", "GOVT_ALLOTMENT", "INHERITANCE"
        string deedDocumentHash;
        address registrarApprover;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // -------------------------------------------------------------
    // STATE STORAGE
    // -------------------------------------------------------------
    // parcelId => LandParcel
    mapping(string => LandParcel) private _parcels;

    // parcelId => TransferRequest
    mapping(string => TransferRequest) private _activeTransfers;

    // parcelId => MortgageRecord
    mapping(string => MortgageRecord) private _activeMortgages;

    // parcelId => DisputeRecord
    mapping(string => DisputeRecord) private _activeDisputes;

    // parcelId => OwnershipHistoryEntry[]
    mapping(string => OwnershipHistoryEntry[]) private _ownershipHistories;

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
        string bankName,
        string loanReferenceNumber,
        uint256 loanAmount,
        address indexed bankOfficer,
        uint256 timestamp
    );

    event MortgageReleased(
        string indexed parcelId,
        string releaseDocHash,
        address indexed bankOfficer,
        uint256 timestamp
    );

    event DisputeInjunctionApplied(
        string indexed parcelId,
        string courtName,
        string caseNumber,
        string courtOrderHash,
        address indexed judgeSigner,
        uint256 timestamp
    );

    event DisputeInjunctionLifted(
        string indexed parcelId,
        string judgmentDocHash,
        address indexed judgeSigner,
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
    ) {
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
    /**
     * @notice Registers a genesis land parcel with its ULPIN and title deed hash.
     * @dev Only authorized Revenue or Registrar officers can register new verified parcels.
     */
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
            isMortgaged: false,
            isDisputed: false,
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
    // 2-KEY TRANSFER AUTHORIZATION WORKFLOW & FRAUD CHECK ENGINE
    // -------------------------------------------------------------

    /**
     * @notice Step 1 of Transfer: Owner (Seller) initiates transfer with digital sign-off.
     * @dev Executes Fraud Policy Check Gates before accepting transfer.
     */
    function initiateTransfer(
        string calldata parcelId,
        address buyer,
        uint256 saleConsideration,
        string calldata saleDeedHash
    ) external nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];

        // FRAUD CHECK GATE 1: Existence check
        require(parcel.exists, "BHUMI: Parcel does not exist");

        // FRAUD CHECK GATE 2: Caller must be the recorded owner (blocks unauthorized seller)
        require(
            parcel.currentOwner == msg.sender,
            "BHUMI: FRAUD_DETECTED - Caller is not the recorded owner"
        );

        // FRAUD CHECK GATE 3: Valid buyer address
        require(buyer != address(0), "BHUMI: Invalid buyer address");
        require(buyer != msg.sender, "BHUMI: Buyer cannot be the same as seller");

        // FRAUD CHECK GATE 4: Valid document hash
        require(bytes(saleDeedHash).length > 0, "BHUMI: Sale deed SHA-256 hash required");

        // FRAUD CHECK GATE 5: Bank Mortgage Conflict Check
        require(
            !parcel.isMortgaged,
            "BHUMI: FRAUD_DETECTED - Active Bank Mortgage Hold exists"
        );

        // FRAUD CHECK GATE 6: Judiciary Dispute Injunction Check
        require(
            !parcel.isDisputed,
            "BHUMI: FRAUD_DETECTED - Property has active Court Dispute Injunction"
        );

        // FRAUD CHECK GATE 7: Emergency Freeze Check
        require(!parcel.isLocked, "BHUMI: Property is locked by authorities");

        // Check if there is already an active transfer
        require(
            !_activeTransfers[parcelId].isActive,
            "BHUMI: Active transfer request already in progress for this parcel"
        );

        _activeTransfers[parcelId] = TransferRequest({
            parcelId: parcelId,
            seller: msg.sender,
            buyer: buyer,
            saleConsideration: saleConsideration,
            saleDeedHash: saleDeedHash,
            sellerApproved: true, // Key 1 provided by Seller transaction
            buyerAccepted: false,
            govtApproved: false, // Key 2 pending
            registrarApprover: address(0),
            initiatedTimestamp: block.timestamp,
            completedTimestamp: 0,
            isActive: true
        });

        emit TransferInitiated(
            parcelId,
            msg.sender,
            buyer,
            saleDeedHash,
            saleConsideration,
            block.timestamp
        );
    }

    /**
     * @notice Step 2 of Transfer: Buyer acknowledges and accepts transfer terms.
     */
    function buyerAcceptTransfer(string calldata parcelId) external nonReentrant {
        TransferRequest storage req = _activeTransfers[parcelId];
        require(req.isActive, "BHUMI: No active transfer request");
        require(
            req.buyer == msg.sender,
            "BHUMI: Caller is not the designated buyer"
        );
        require(!req.buyerAccepted, "BHUMI: Buyer already accepted transfer");

        req.buyerAccepted = true;

        emit TransferBuyerAccepted(parcelId, msg.sender, block.timestamp);
    }

    /**
     * @notice Step 3 & 4 of Transfer: Government Sub-Registrar authorizes and commits transfer.
     * @dev Fulfills 2-Key authorization (Owner Key + Govt Key). Atomically commits ownership mutation on-chain.
     */
    function authorizeAndCommitTransfer(
        string calldata parcelId
    ) external onlyRole(REGISTRAR_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        TransferRequest storage req = _activeTransfers[parcelId];

        // Verification checks
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(req.isActive, "BHUMI: No active transfer request to authorize");
        require(req.sellerApproved, "BHUMI: Missing Seller Authorization (Key 1)");
        require(req.seller == parcel.currentOwner, "BHUMI: Seller mismatch with current owner");

        // RE-RUN FRAUD CHECK GATES (ensure state did not change between initiation & approval)
        require(!parcel.isMortgaged, "BHUMI: FRAUD_DETECTED - Property has active Bank Mortgage");
        require(!parcel.isDisputed, "BHUMI: FRAUD_DETECTED - Property has active Court Dispute");
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
     * @notice Cancels an active transfer request (callable by Seller or Registrar).
     */
    function cancelTransferRequest(
        string calldata parcelId,
        string calldata reason
    ) external nonReentrant {
        TransferRequest storage req = _activeTransfers[parcelId];
        require(req.isActive, "BHUMI: No active transfer request");
        require(
            msg.sender == req.seller || hasRole(REGISTRAR_ROLE, msg.sender),
            "BHUMI: Unauthorized to cancel transfer"
        );

        req.isActive = false;

        emit TransferCancelled(parcelId, msg.sender, reason, block.timestamp);
    }

    // -------------------------------------------------------------
    // BANK NODE: MORTGAGE / ENCUMBRANCE MANAGEMENT
    // -------------------------------------------------------------

    /**
     * @notice Places a bank mortgage hold on the property.
     * @dev Only authorized BANK_ROLE can execute. Automatically blocks transfers.
     */
    function applyMortgage(
        string calldata parcelId,
        string calldata bankName,
        string calldata loanReferenceNumber,
        uint256 loanAmount,
        string calldata mortgageDocHash
    ) external onlyRole(BANK_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(!parcel.isMortgaged, "BHUMI: Parcel already has an active mortgage");
        require(!_activeTransfers[parcelId].isActive, "BHUMI: Cannot mortgage parcel during active transfer");

        parcel.isMortgaged = true;
        parcel.lastUpdatedTimestamp = block.timestamp;

        _activeMortgages[parcelId] = MortgageRecord({
            parcelId: parcelId,
            bankName: bankName,
            loanReferenceNumber: loanReferenceNumber,
            loanAmount: loanAmount,
            mortgageDocHash: mortgageDocHash,
            bankOfficer: msg.sender,
            timestamp: block.timestamp,
            isActive: true
        });

        emit MortgageApplied(
            parcelId,
            bankName,
            loanReferenceNumber,
            loanAmount,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Releases a bank mortgage hold after loan repayment (NOC).
     */
    function releaseMortgage(
        string calldata parcelId,
        string calldata releaseDocHash
    ) external onlyRole(BANK_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(parcel.isMortgaged, "BHUMI: No active mortgage on this parcel");

        parcel.isMortgaged = false;
        parcel.lastUpdatedTimestamp = block.timestamp;
        _activeMortgages[parcelId].isActive = false;

        emit MortgageReleased(parcelId, releaseDocHash, msg.sender, block.timestamp);
    }

    // -------------------------------------------------------------
    // JUDICIARY / COURT NODE: DISPUTE INJUNCTION MANAGEMENT
    // -------------------------------------------------------------

    /**
     * @notice Places a judicial injunction / dispute stay on the property.
     * @dev Only authorized JUDICIARY_ROLE can execute. Automatically freezes property transfers.
     */
    function applyDisputeInjunction(
        string calldata parcelId,
        string calldata courtName,
        string calldata caseNumber,
        string calldata courtOrderHash,
        string calldata disputeReason
    ) external onlyRole(JUDICIARY_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(!parcel.isDisputed, "BHUMI: Parcel already has an active court injunction");

        parcel.isDisputed = true;
        parcel.lastUpdatedTimestamp = block.timestamp;

        // If an active transfer was in progress, cancel it immediately due to court order
        if (_activeTransfers[parcelId].isActive) {
            _activeTransfers[parcelId].isActive = false;
            emit TransferCancelled(
                parcelId,
                msg.sender,
                "Cancelled due to Judicial Injunction Order",
                block.timestamp
            );
        }

        _activeDisputes[parcelId] = DisputeRecord({
            parcelId: parcelId,
            courtName: courtName,
            caseNumber: caseNumber,
            courtOrderHash: courtOrderHash,
            disputeReason: disputeReason,
            judgeSigner: msg.sender,
            timestamp: block.timestamp,
            isActive: true
        });

        emit DisputeInjunctionApplied(
            parcelId,
            courtName,
            caseNumber,
            courtOrderHash,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Lifts a court dispute injunction following legal resolution / judgment.
     */
    function liftDisputeInjunction(
        string calldata parcelId,
        string calldata judgmentDocHash
    ) external onlyRole(JUDICIARY_ROLE) nonReentrant {
        LandParcel storage parcel = _parcels[parcelId];
        require(parcel.exists, "BHUMI: Parcel does not exist");
        require(parcel.isDisputed, "BHUMI: No active dispute on this parcel");

        parcel.isDisputed = false;
        parcel.lastUpdatedTimestamp = block.timestamp;
        _activeDisputes[parcelId].isActive = false;

        emit DisputeInjunctionLifted(parcelId, judgmentDocHash, msg.sender, block.timestamp);
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

    /**
     * @notice Returns complete details of a registered land parcel.
     */
    function getParcel(string calldata parcelId) external view returns (LandParcel memory) {
        require(_parcels[parcelId].exists, "BHUMI: Parcel not found");
        return _parcels[parcelId];
    }

    /**
     * @notice Returns the full chronological ownership history (Chain of Title).
     */
    function getOwnershipHistory(
        string calldata parcelId
    ) external view returns (OwnershipHistoryEntry[] memory) {
        require(_parcels[parcelId].exists, "BHUMI: Parcel not found");
        return _ownershipHistories[parcelId];
    }

    /**
     * @notice Returns the active transfer request for a parcel, if any.
     */
    function getActiveTransfer(
        string calldata parcelId
    ) external view returns (TransferRequest memory) {
        return _activeTransfers[parcelId];
    }

    /**
     * @notice Returns active mortgage details for a parcel.
     */
    function getActiveMortgage(
        string calldata parcelId
    ) external view returns (MortgageRecord memory) {
        return _activeMortgages[parcelId];
    }

    /**
     * @notice Returns active dispute details for a parcel.
     */
    function getActiveDispute(
        string calldata parcelId
    ) external view returns (DisputeRecord memory) {
        return _activeDisputes[parcelId];
    }

    /**
     * @notice Fast title verification helper for public, banks, and buyers.
     * @return isCleanTitle True if property is active, not mortgaged, not disputed, and not locked.
     */
    function verifyTitle(
        string calldata parcelId
    )
        external
        view
        returns (
            bool isCleanTitle,
            address currentOwner,
            bool isMortgaged,
            bool isDisputed,
            bool isLocked,
            uint256 historyCount,
            string memory currentDeedHash
        )
    {
        LandParcel memory parcel = _parcels[parcelId];
        if (!parcel.exists) {
            return (false, address(0), false, false, false, 0, "");
        }

        bool clean = (!parcel.isMortgaged && !parcel.isDisputed && !parcel.isLocked);
        return (
            clean,
            parcel.currentOwner,
            parcel.isMortgaged,
            parcel.isDisputed,
            parcel.isLocked,
            _ownershipHistories[parcelId].length,
            parcel.deedDocumentHash
        );
    }

    /**
     * @notice Verifies whether a given calculated SHA-256 hash matches the on-chain recorded title deed.
     */
    function verifyDeedHash(
        string calldata parcelId,
        string calldata testHash
    ) external view returns (bool isValid) {
        LandParcel memory parcel = _parcels[parcelId];
        if (!parcel.exists) return false;
        return (keccak256(bytes(parcel.deedDocumentHash)) == keccak256(bytes(testHash)));
    }

    /**
     * @notice Returns total count of all registered properties.
     */
    function getTotalParcelsCount() external view returns (uint256) {
        return _allParcelIds.length;
    }

    /**
     * @notice Returns parcel ID by index.
     */
    function getParcelIdByIndex(uint256 index) external view returns (string memory) {
        require(index < _allParcelIds.length, "BHUMI: Index out of bounds");
        return _allParcelIds[index];
    }
}
