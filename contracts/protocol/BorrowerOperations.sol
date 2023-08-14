// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IBorrowerOperations.sol";
import "../interfaces/ITroveManager.sol";
import "../interfaces/IZKUSDToken.sol";
import "../interfaces/ICollSurplusPool.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/IZKTStaking.sol";
import "../dependencies/CheckContract.sol";
import "../dependencies/FullMath.sol";
import "../dependencies/ZKTProtocolBase.sol";

contract BorrowerOperations is
    IBorrowerOperations,
    ZKTProtocolBase,
    CheckContract,
    Ownable
{
    using SafeMath for uint256;

    string public constant NAME = "BorrowerOperations";

    // --- Connected contract declarations ---

    ITroveManager public troveManager;

    address stabilityPoolAddress;

    address gasPoolAddress;

    ICollSurplusPool collSurplusPool;

    IZKTStaking public zktStaking;
    address public zktStakingAddress;

    IZKUSDToken public zkusdToken;

    // A doubly linked list of Troves, sorted by their collateral ratios
    ISortedTroves public sortedTroves;

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _defaultPoolAddress,
        address _stabilityPoolAddress,
        address _gasPoolAddress,
        address _collSurplusPoolAddress,
        address _priceFeedAddress,
        address _sortedTrovesAddress,
        address _zkusdTokenAddress,
        address _zktStakingAddress
    ) external override onlyOwner {
        // This makes impossible to open a trove with zero withdrawn ZKUSD
        assert(MIN_NET_DEBT > 0);

        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_gasPoolAddress);
        checkContract(_collSurplusPoolAddress);
        checkContract(_priceFeedAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_zkusdTokenAddress);
        checkContract(_zktStakingAddress);

        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        defaultPool = IDefaultPool(_defaultPoolAddress);
        stabilityPoolAddress = _stabilityPoolAddress;
        gasPoolAddress = _gasPoolAddress;
        collSurplusPool = ICollSurplusPool(_collSurplusPoolAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        zkusdToken = IZKUSDToken(_zkusdTokenAddress);
        zktStakingAddress = _zktStakingAddress;
        zktStaking = IZKTStaking(_zktStakingAddress);

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit GasPoolAddressChanged(_gasPoolAddress);
        emit CollSurplusPoolAddressChanged(_collSurplusPoolAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit ZKUSDTokenAddressChanged(_zkusdTokenAddress);
        emit ZKTStakingAddressChanged(_zktStakingAddress);

        //renounceOwnership();
    }

    // --- Borrower Trove Operations ---

    function openTrove(
        uint _maxFeePercentage,
        uint _ZKUSDAmount,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            zkusdToken
        );
        LocalVariables_openTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
        _requireTroveisNotActive(contractsCache.troveManager, msg.sender);

        vars.ZKUSDFee;
        vars.netDebt = _ZKUSDAmount;

        if (!isRecoveryMode) {
            vars.ZKUSDFee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.zkusdToken,
                _ZKUSDAmount,
                _maxFeePercentage
            );
            vars.netDebt = vars.netDebt.add(vars.ZKUSDFee);
        }
        _requireAtLeastMinNetDebt(vars.netDebt);

        // ICR is based on the composite debt, i.e. the requested ZKUSD amount + ZKUSD borrowing fee + ZKUSD gas comp.
        vars.compositeDebt = _getCompositeDebt(vars.netDebt);
        assert(vars.compositeDebt > 0);

        vars.ICR = FullMath._computeCR(
            msg.value,
            vars.compositeDebt,
            vars.price
        );
        vars.NICR = FullMath._computeNominalCR(msg.value, vars.compositeDebt);

        if (isRecoveryMode) {
            _requireICRisAboveCCR(vars.ICR);
        } else {
            _requireICRisAboveMCR(vars.ICR);
            uint newTCR = _getNewTCRFromTroveChange(
                msg.value,
                true,
                vars.compositeDebt,
                true,
                vars.price
            ); // bools: coll increase, debt increase
            _requireNewTCRisAboveCCR(newTCR);
        }

        // Set the trove struct's properties
        contractsCache.troveManager.setTroveStatus(msg.sender, 1);
        contractsCache.troveManager.increaseTroveColl(msg.sender, msg.value);
        contractsCache.troveManager.increaseTroveDebt(
            msg.sender,
            vars.compositeDebt
        );

        contractsCache.troveManager.updateTroveRewardSnapshots(msg.sender);
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            msg.sender
        );

        sortedTroves.insert(msg.sender, vars.NICR, _upperHint, _lowerHint);
        vars.arrayIndex = contractsCache.troveManager.addTroveOwnerToArray(
            msg.sender
        );
        emit TroveCreated(msg.sender, vars.arrayIndex);

        // Move the ether to the Active Pool, and mint the ZKUSDAmount to the borrower
        _activePoolAddColl(contractsCache.activePool, msg.value);
        _withdrawZKUSD(
            contractsCache.activePool,
            contractsCache.zkusdToken,
            msg.sender,
            _ZKUSDAmount,
            vars.netDebt
        );
        // Move the ZKUSD gas compensation to the Gas Pool
        _withdrawZKUSD(
            contractsCache.activePool,
            contractsCache.zkusdToken,
            gasPoolAddress,
            ZKUSD_GAS_COMPENSATION,
            ZKUSD_GAS_COMPENSATION
        );

        emit TroveUpdated(
            msg.sender,
            vars.compositeDebt,
            msg.value,
            vars.stake,
            Operation.openTrove
        );
        emit ZKUSDBorrowingFeePaid(msg.sender, vars.ZKUSDFee);
    }

    // Send NEON as collateral to a trove
    function addColl(
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _adjustTrove(msg.sender, 0, 0, false, _upperHint, _lowerHint, 0);
    }

    // Send NEON as collateral to a trove. Called by only the Stability Pool.
    function moveNEONGainToTrove(
        address _borrower,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _requireCallerIsStabilityPool();
        _adjustTrove(_borrower, 0, 0, false, _upperHint, _lowerHint, 0);
    }

    // Withdraw NEON collateral from a trove
    function withdrawColl(
        uint _collWithdrawal,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            0,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    // Withdraw ZKUSD tokens from a trove: mint new ZKUSD tokens to the owner, and increase the trove's debt accordingly
    function withdrawZKUSD(
        uint _maxFeePercentage,
        uint _ZKUSDAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            0,
            _ZKUSDAmount,
            true,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    // Repay ZKUSD tokens to a Trove: Burn the repaid ZKUSD tokens, and reduce the trove's debt accordingly
    function repayZKUSD(
        uint _ZKUSDAmount,
        address _upperHint,
        address _lowerHint
    ) external override {
        _adjustTrove(
            msg.sender,
            0,
            _ZKUSDAmount,
            false,
            _upperHint,
            _lowerHint,
            0
        );
    }

    function adjustTrove(
        uint _maxFeePercentage,
        uint _collWithdrawal,
        uint _ZKUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint
    ) external payable override {
        _adjustTrove(
            msg.sender,
            _collWithdrawal,
            _ZKUSDChange,
            _isDebtIncrease,
            _upperHint,
            _lowerHint,
            _maxFeePercentage
        );
    }

    /*
     * _adjustTrove(): Alongside a debt change, this function can perform either a collateral top-up or a collateral withdrawal.
     *
     * It therefore expects either a positive msg.value, or a positive _collWithdrawal argument.
     *
     * If both are positive, it will revert.
     */
    function _adjustTrove(
        address _borrower,
        uint _collWithdrawal,
        uint _ZKUSDChange,
        bool _isDebtIncrease,
        address _upperHint,
        address _lowerHint,
        uint _maxFeePercentage
    ) internal {
        ContractsCache memory contractsCache = ContractsCache(
            troveManager,
            activePool,
            zkusdToken
        );
        LocalVariables_adjustTrove memory vars;

        vars.price = priceFeed.fetchPrice();
        bool isRecoveryMode = _checkRecoveryMode(vars.price);

        if (_isDebtIncrease) {
            _requireValidMaxFeePercentage(_maxFeePercentage, isRecoveryMode);
            _requireNonZeroDebtChange(_ZKUSDChange);
        }
        _requireSingularCollChange(_collWithdrawal);
        _requireNonZeroAdjustment(_collWithdrawal, _ZKUSDChange);
        _requireTroveisActive(contractsCache.troveManager, _borrower);

        // Confirm the operation is either a borrower adjusting their own trove, or a pure NEON transfer from the Stability Pool to a trove
        assert(
            msg.sender == _borrower ||
                (msg.sender == stabilityPoolAddress &&
                    msg.value > 0 &&
                    _ZKUSDChange == 0)
        );

        contractsCache.troveManager.applyPendingRewards(_borrower);

        // Get the collChange based on whether or not NEON was sent in the transaction
        (vars.collChange, vars.isCollIncrease) = _getCollChange(
            msg.value,
            _collWithdrawal
        );

        vars.netDebtChange = _ZKUSDChange;

        // If the adjustment incorporates a debt increase and system is in Normal Mode, then trigger a borrowing fee
        if (_isDebtIncrease && !isRecoveryMode) {
            vars.ZKUSDFee = _triggerBorrowingFee(
                contractsCache.troveManager,
                contractsCache.zkusdToken,
                _ZKUSDChange,
                _maxFeePercentage
            );
            vars.netDebtChange = vars.netDebtChange.add(vars.ZKUSDFee); // The raw debt change includes the fee
        }

        vars.debt = contractsCache.troveManager.getTroveDebt(_borrower);
        vars.coll = contractsCache.troveManager.getTroveColl(_borrower);

        // Get the trove's old ICR before the adjustment, and what its new ICR will be after the adjustment
        vars.oldICR = FullMath._computeCR(vars.coll, vars.debt, vars.price);
        vars.newICR = _getNewICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease,
            vars.price
        );
        assert(_collWithdrawal <= vars.coll);

        // Check the adjustment satisfies all conditions for the current system mode
        _requireValidAdjustmentInCurrentMode(
            isRecoveryMode,
            _collWithdrawal,
            _isDebtIncrease,
            vars
        );

        // When the adjustment is a debt repayment, check it's a valid amount and that the caller has enough ZKUSD
        if (!_isDebtIncrease && _ZKUSDChange > 0) {
            _requireAtLeastMinNetDebt(
                _getNetDebt(vars.debt).sub(vars.netDebtChange)
            );
            _requireValidZKUSDRepayment(vars.debt, vars.netDebtChange);
            _requireSufficientZKUSDBalance(
                contractsCache.zkusdToken,
                _borrower,
                vars.netDebtChange
            );
        }

        (vars.newColl, vars.newDebt) = _updateTroveFromAdjustment(
            contractsCache.troveManager,
            _borrower,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        vars.stake = contractsCache.troveManager.updateStakeAndTotalStakes(
            _borrower
        );

        // Re-insert trove in to the sorted list
        uint newNICR = _getNewNominalICRFromTroveChange(
            vars.coll,
            vars.debt,
            vars.collChange,
            vars.isCollIncrease,
            vars.netDebtChange,
            _isDebtIncrease
        );
        sortedTroves.reInsert(_borrower, newNICR, _upperHint, _lowerHint);

        emit TroveUpdated(
            _borrower,
            vars.newDebt,
            vars.newColl,
            vars.stake,
            Operation.adjustTrove
        );
        emit ZKUSDBorrowingFeePaid(msg.sender, vars.ZKUSDFee);

        // Use the unmodified _ZKUSDChange here, as we don't send the fee to the user
        _moveTokensAndNEONfromAdjustment(
            contractsCache.activePool,
            contractsCache.zkusdToken,
            msg.sender,
            vars.collChange,
            vars.isCollIncrease,
            _ZKUSDChange,
            _isDebtIncrease,
            vars.netDebtChange
        );
    }

    function closeTrove() external override {
        ITroveManager troveManagerCached = troveManager;
        IActivePool activePoolCached = activePool;
        IZKUSDToken zkusdTokenCached = zkusdToken;

        _requireTroveisActive(troveManagerCached, msg.sender);
        uint price = priceFeed.fetchPrice();
        _requireNotInRecoveryMode(price);

        troveManagerCached.applyPendingRewards(msg.sender);

        uint coll = troveManagerCached.getTroveColl(msg.sender);
        uint debt = troveManagerCached.getTroveDebt(msg.sender);

        _requireSufficientZKUSDBalance(
            zkusdTokenCached,
            msg.sender,
            debt.sub(ZKUSD_GAS_COMPENSATION)
        );

        uint newTCR = _getNewTCRFromTroveChange(
            coll,
            false,
            debt,
            false,
            price
        );
        _requireNewTCRisAboveCCR(newTCR);

        troveManagerCached.removeStake(msg.sender);
        troveManagerCached.closeTrove(msg.sender);

        emit TroveUpdated(msg.sender, 0, 0, 0, Operation.closeTrove);

        // Burn the repaid ZKUSD from the user's balance and the gas compensation from the Gas Pool
        _repayZKUSD(
            activePoolCached,
            zkusdTokenCached,
            msg.sender,
            debt.sub(ZKUSD_GAS_COMPENSATION)
        );
        _repayZKUSD(
            activePoolCached,
            zkusdTokenCached,
            gasPoolAddress,
            ZKUSD_GAS_COMPENSATION
        );

        // Send the collateral back to the user
        activePoolCached.sendNEON(msg.sender, coll);
    }

    /**
     * Claim remaining collateral from a redemption or from a liquidation with ICR > MCR in Recovery Mode
     */
    function claimCollateral() external override {
        // send NEON from CollSurplus Pool to owner
        collSurplusPool.claimColl(msg.sender);
    }

    // --- Helper functions ---

    function _triggerBorrowingFee(
        ITroveManager _troveManager,
        IZKUSDToken _zkusdToken,
        uint _ZKUSDAmount,
        uint _maxFeePercentage
    ) internal returns (uint) {
        _troveManager.decayBaseRateFromBorrowing(); // decay the baseRate state variable
        uint ZKUSDFee = _troveManager.getBorrowingFee(_ZKUSDAmount);

        _requireUserAcceptsFee(ZKUSDFee, _ZKUSDAmount, _maxFeePercentage);

        // Send fee to ZK staking contract
        zktStaking.increaseF_ZKUSD(ZKUSDFee);
        _zkusdToken.mint(zktStakingAddress, ZKUSDFee);

        return ZKUSDFee;
    }

    function _getUSDValue(
        uint _coll,
        uint _price
    ) internal pure returns (uint) {
        uint usdValue = _price.mul(_coll).div(DECIMAL_PRECISION);

        return usdValue;
    }

    function _getCollChange(
        uint _collReceived,
        uint _requestedCollWithdrawal
    ) internal pure returns (uint collChange, bool isCollIncrease) {
        if (_collReceived != 0) {
            collChange = _collReceived;
            isCollIncrease = true;
        } else {
            collChange = _requestedCollWithdrawal;
        }
    }

    // Update trove's coll and debt based on whether they increase or decrease
    function _updateTroveFromAdjustment(
        ITroveManager _troveManager,
        address _borrower,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease
    ) internal returns (uint, uint) {
        uint newColl = (_isCollIncrease)
            ? _troveManager.increaseTroveColl(_borrower, _collChange)
            : _troveManager.decreaseTroveColl(_borrower, _collChange);
        uint newDebt = (_isDebtIncrease)
            ? _troveManager.increaseTroveDebt(_borrower, _debtChange)
            : _troveManager.decreaseTroveDebt(_borrower, _debtChange);

        return (newColl, newDebt);
    }

    function _moveTokensAndNEONfromAdjustment(
        IActivePool _activePool,
        IZKUSDToken _zkusdToken,
        address _borrower,
        uint _collChange,
        bool _isCollIncrease,
        uint _ZKUSDChange,
        bool _isDebtIncrease,
        uint _netDebtChange
    ) internal {
        if (_isDebtIncrease) {
            _withdrawZKUSD(
                _activePool,
                _zkusdToken,
                _borrower,
                _ZKUSDChange,
                _netDebtChange
            );
        } else {
            _repayZKUSD(_activePool, _zkusdToken, _borrower, _ZKUSDChange);
        }

        if (_isCollIncrease) {
            _activePoolAddColl(_activePool, _collChange);
        } else {
            _activePool.sendNEON(_borrower, _collChange);
        }
    }

    // Send NEON to Active Pool and increase its recorded NEON balance
    function _activePoolAddColl(
        IActivePool _activePool,
        uint _amount
    ) internal {
        (bool success, ) = address(_activePool).call{value: _amount}("");
        require(success, "Operation: Sending NEON to ActivePool failed");
    }

    // Issue the specified amount of ZKUSD to _account and increases the total active debt (_netDebtIncrease potentially includes a ZKUSDFee)
    function _withdrawZKUSD(
        IActivePool _activePool,
        IZKUSDToken _zkusdToken,
        address _account,
        uint _ZKUSDAmount,
        uint _netDebtIncrease
    ) internal {
        _activePool.increaseZKUSDDebt(_netDebtIncrease);
        _zkusdToken.mint(_account, _ZKUSDAmount);
    }

    // Burn the specified amount of ZKUSD from _account and decreases the total active debt
    function _repayZKUSD(
        IActivePool _activePool,
        IZKUSDToken _zkusdToken,
        address _account,
        uint _ZKUSD
    ) internal {
        _activePool.decreaseZKUSDDebt(_ZKUSD);
        _zkusdToken.burn(_account, _ZKUSD);
    }

    // --- 'Require' wrapper functions ---

    function _requireSingularCollChange(uint _collWithdrawal) internal view {
        require(
            msg.value == 0 || _collWithdrawal == 0,
            "BorrowerOperations: Cannot withdraw and add coll"
        );
    }

    function _requireCallerIsBorrower(address _borrower) internal view {
        require(
            msg.sender == _borrower,
            "Operation: Caller must be the borrower for a withdrawal"
        );
    }

    function _requireNonZeroAdjustment(
        uint _collWithdrawal,
        uint _ZKUSDChange
    ) internal view {
        require(
            msg.value != 0 || _collWithdrawal != 0 || _ZKUSDChange != 0,
            "Operation: There must be either a collateral change or a debt change"
        );
    }

    function _requireTroveisActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        uint status = _troveManager.getTroveStatus(_borrower);
        require(status == 1, "Operation: Trove does not exist or is closed");
    }

    function _requireTroveisNotActive(
        ITroveManager _troveManager,
        address _borrower
    ) internal view {
        uint status = _troveManager.getTroveStatus(_borrower);
        require(status != 1, "Operation: Trove is active");
    }

    function _requireNonZeroDebtChange(uint _ZKUSDChange) internal pure {
        require(
            _ZKUSDChange > 0,
            "Operation: Debt increase requires non-zero debtChange"
        );
    }

    function _requireNotInRecoveryMode(uint _price) internal view {
        require(
            !_checkRecoveryMode(_price),
            "Operation: Operation not permitted during Recovery Mode"
        );
    }

    function _requireNoCollWithdrawal(uint _collWithdrawal) internal pure {
        require(
            _collWithdrawal == 0,
            "Operation: Collateral withdrawal not permitted Recovery Mode"
        );
    }

    function _requireValidAdjustmentInCurrentMode(
        bool _isRecoveryMode,
        uint _collWithdrawal,
        bool _isDebtIncrease,
        LocalVariables_adjustTrove memory _vars
    ) internal view {
        /*
         *In Recovery Mode, only allow:
         *
         * - Pure collateral top-up
         * - Pure debt repayment
         * - Collateral top-up with debt repayment
         * - A debt increase combined with a collateral top-up which makes the ICR >= 150% and improves the ICR (and by extension improves the TCR).
         *
         * In Normal Mode, ensure:
         *
         * - The new ICR is above MCR
         * - The adjustment won't pull the TCR below CCR
         */
        if (_isRecoveryMode) {
            _requireNoCollWithdrawal(_collWithdrawal);
            if (_isDebtIncrease) {
                _requireICRisAboveCCR(_vars.newICR);
                _requireNewICRisAboveOldICR(_vars.newICR, _vars.oldICR);
            }
        } else {
            // if Normal Mode
            _requireICRisAboveMCR(_vars.newICR);
            _vars.newTCR = _getNewTCRFromTroveChange(
                _vars.collChange,
                _vars.isCollIncrease,
                _vars.netDebtChange,
                _isDebtIncrease,
                _vars.price
            );
            _requireNewTCRisAboveCCR(_vars.newTCR);
        }
    }

    function _requireICRisAboveMCR(uint _newICR) internal pure {
        require(
            _newICR >= MCR,
            "Operation: An operation that would result in ICR < MCR is not permitted"
        );
    }

    function _requireICRisAboveCCR(uint _newICR) internal pure {
        require(
            _newICR >= CCR,
            "Operation: Operation must leave trove with ICR >= CCR"
        );
    }

    function _requireNewICRisAboveOldICR(
        uint _newICR,
        uint _oldICR
    ) internal pure {
        require(
            _newICR >= _oldICR,
            "Operation: Cannot decrease your Trove's ICR in Recovery Mode"
        );
    }

    function _requireNewTCRisAboveCCR(uint _newTCR) internal pure {
        require(
            _newTCR >= CCR,
            "Operation: An operation that would result in TCR < CCR is not permitted"
        );
    }

    function _requireAtLeastMinNetDebt(uint _netDebt) internal pure {
        require(
            _netDebt >= MIN_NET_DEBT,
            "Operation: Trove's net debt must be greater than minimum"
        );
    }

    function _requireValidZKUSDRepayment(
        uint _currentDebt,
        uint _debtRepayment
    ) internal pure {
        require(
            _debtRepayment <= _currentDebt.sub(ZKUSD_GAS_COMPENSATION),
            "Operation: Amount repaid must not be larger than the Trove's debt"
        );
    }

    function _requireCallerIsStabilityPool() internal view {
        require(
            msg.sender == stabilityPoolAddress,
            "Operation: Caller is not Stability Pool"
        );
    }

    function _requireSufficientZKUSDBalance(
        IZKUSDToken _zkusdToken,
        address _borrower,
        uint _debtRepayment
    ) internal view {
        require(
            _zkusdToken.balanceOf(_borrower) >= _debtRepayment,
            "Operation: Caller doesnt have enough ZKUSD to make repayment"
        );
    }

    function _requireValidMaxFeePercentage(
        uint _maxFeePercentage,
        bool _isRecoveryMode
    ) internal pure {
        if (_isRecoveryMode) {
            require(
                _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must less than or equal to 100%"
            );
        } else {
            require(
                _maxFeePercentage >= BORROWING_FEE_FLOOR &&
                    _maxFeePercentage <= DECIMAL_PRECISION,
                "Max fee percentage must be between 0.5% and 100%"
            );
        }
    }

    // --- ICR and TCR getters ---

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewNominalICRFromTroveChange(
        uint _coll,
        uint _debt,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint) {
        (uint newColl, uint newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );

        uint newNICR = FullMath._computeNominalCR(newColl, newDebt);
        return newNICR;
    }

    // Compute the new collateral ratio, considering the change in coll and debt. Assumes 0 pending rewards.
    function _getNewICRFromTroveChange(
        uint _coll,
        uint _debt,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease,
        uint _price
    ) internal pure returns (uint) {
        (uint newColl, uint newDebt) = _getNewTroveAmounts(
            _coll,
            _debt,
            _collChange,
            _isCollIncrease,
            _debtChange,
            _isDebtIncrease
        );

        uint newICR = FullMath._computeCR(newColl, newDebt, _price);
        return newICR;
    }

    function _getNewTroveAmounts(
        uint _coll,
        uint _debt,
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease
    ) internal pure returns (uint, uint) {
        uint newColl = _coll;
        uint newDebt = _debt;

        newColl = _isCollIncrease
            ? _coll.add(_collChange)
            : _coll.sub(_collChange);
        newDebt = _isDebtIncrease
            ? _debt.add(_debtChange)
            : _debt.sub(_debtChange);

        return (newColl, newDebt);
    }

    function _getNewTCRFromTroveChange(
        uint _collChange,
        bool _isCollIncrease,
        uint _debtChange,
        bool _isDebtIncrease,
        uint _price
    ) internal view returns (uint) {
        uint totalColl = getEntireSystemColl();
        uint totalDebt = getEntireSystemDebt();

        totalColl = _isCollIncrease
            ? totalColl.add(_collChange)
            : totalColl.sub(_collChange);
        totalDebt = _isDebtIncrease
            ? totalDebt.add(_debtChange)
            : totalDebt.sub(_debtChange);

        uint newTCR = FullMath._computeCR(totalColl, totalDebt, _price);
        return newTCR;
    }

    function getCompositeDebt(
        uint _debt
    ) external pure override returns (uint) {
        return _getCompositeDebt(_debt);
    }
}
