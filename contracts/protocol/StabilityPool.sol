// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IBorrowerOperations.sol";
import "../interfaces/ITroveManager.sol";
import "../interfaces/IZKUSDToken.sol";
import "../interfaces/ICollSurplusPool.sol";
import "../interfaces/ISortedTroves.sol";
import "../interfaces/IZKTStaking.sol";
import "../interfaces/ICommunityIssuance.sol";
import "../dependencies/CheckContract.sol";
import "../dependencies/FullMath.sol";
import "../dependencies/ZKTProtocolBase.sol";

/*
 * The Stability Pool holds ZKUSD tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its ZKUSD debt gets offset with
 * ZKUSD in the Stability Pool:  that is, the offset debt evaporates, and an equal amount of ZKUSD tokens in the Stability Pool is burned.
 *
 * Thus, a liquidation causes each depositor to receive a ZKUSD loss, in proportion to their deposit as a share of total deposits.
 * They also receive an ETH gain, as the ETH collateral of the liquidated trove is distributed among Stability depositors,
 * in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation that depletes 40%
 * of the total ZKUSD in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each liquidation depletes the deposit,
 * multiplying it by some factor in range ]0,1[
 *
 *
 * --- IMPLEMENTATION ---
 *
 * We use a highly scalable method of tracking deposits and ETH gains that has O(1) complexity.
 *
 * When a liquidation occurs, rather than updating each depositor's deposit and ETH gain, we simply update two state variables:
 * a product P, and a sum S.
 *
 * A mathematical manipulation allows us to factor out the initial deposit, and accurately track all depositors' compounded deposits
 * and accumulated ETH gains over time, as liquidations occur, using just these two variables P and S. When depositors join the
 * Stability Pool, they get a snapshot of the latest P and S: P_t and S_t, respectively.
 *
 * The formula for a depositor's accumulated ETH gain is derived here:
 *
 * For a given deposit d_t, the ratio P/P_t tells us the factor by which a deposit has decreased since it joined the Stability Pool,
 * and the term d_t * (S - S_t)/P_t gives us the deposit's total accumulated ETH gain.
 *
 * Each liquidation updates the product P and sum S. After a series of liquidations, a compounded deposit and corresponding ETH gain
 * can be calculated using the initial deposit, the depositor’s snapshots of P and S, and the latest values of P and S.
 *
 * Any time a depositor updates their deposit (withdrawal, top-up) their accumulated ETH gain is paid out, their new deposit is recorded
 * (based on their latest compounded deposit and modified by the withdrawal/top-up), and they receive new snapshots of the latest P and S.
 * Essentially, they make a fresh deposit that overwrites the old one.
 *
 *
 * --- SCALE FACTOR ---
 *
 * Since P is a running product in range ]0,1] that is always-decreasing, it should never reach 0 when multiplied by a number in range ]0,1[.
 * Unfortunately, Solidity floor division always reaches 0, sooner or later.
 *
 * A series of liquidations that nearly empty the Pool (and thus each multiply P by a very small number in range ]0,1[ ) may push P
 * to its 18 digit decimal limit, and round it to 0, when in fact the Pool hasn't been emptied: this would break deposit tracking.
 *
 * So, to track P accurately, we use a scale factor: if a liquidation would cause P to decrease to <1e-9 (and be rounded to 0 by Solidity),
 * we first multiply P by 1e9, and increment a currentScale factor by 1.
 *
 * The added benefit of using 1e9 for the scale factor (rather than 1e18) is that it ensures negligible precision loss close to the
 * scale boundary: when P is at its minimum value of 1e9, the relative precision loss in P due to floor division is only on the
 * order of 1e-9.
 *
 * --- EPOCHS ---
 *
 * Whenever a liquidation fully empties the Stability Pool, all deposits should become 0. However, setting P to 0 would make P be 0
 * forever, and break all future reward calculations.
 *
 * So, every time the Stability Pool is emptied by a liquidation, we reset P = 1 and currentScale = 0, and increment the currentEpoch by 1.
 *
 * --- TRACKING DEPOSIT OVER SCALE CHANGES AND EPOCHS ---
 *
 * When a deposit is made, it gets snapshots of the currentEpoch and the currentScale.
 *
 * When calculating a compounded deposit, we compare the current epoch to the deposit's epoch snapshot. If the current epoch is newer,
 * then the deposit was present during a pool-emptying liquidation, and necessarily has been depleted to 0.
 *
 * Otherwise, we then compare the current scale to the deposit's scale snapshot. If they're equal, the compounded deposit is given by d_t * P/P_t.
 * If it spans one scale change, it is given by d_t * P/(P_t * 1e9). If it spans more than one scale change, we define the compounded deposit
 * as 0, since it is now less than 1e-9'th of its initial value (e.g. a deposit of 1 billion ZKUSD has depleted to < 1 ZKUSD).
 *
 *
 *  --- TRACKING DEPOSITOR'S ETH GAIN OVER SCALE CHANGES AND EPOCHS ---
 *
 * In the current epoch, the latest value of S is stored upon each scale change, and the mapping (scale -> S) is stored for each epoch.
 *
 * This allows us to calculate a deposit's accumulated ETH gain, during the epoch in which the deposit was non-zero and earned ETH.
 *
 * We calculate the depositor's accumulated ETH gain for the scale at which they made the deposit, using the ETH gain formula:
 * e_1 = d_t * (S - S_t) / P_t
 *
 * and also for scale after, taking care to divide the latter by a factor of 1e9:
 * e_2 = d_t * S / (P_t * 1e9)
 *
 * The gain in the second scale will be full, as the starting point was in the previous scale, thus no need to subtract anything.
 * The deposit therefore was present for reward events from the beginning of that second scale.
 *
 *        S_i-S_t + S_{i+1}
 *      .<--------.------------>
 *      .         .
 *      . S_i     .   S_{i+1}
 *   <--.-------->.<----------->
 *   S_t.         .
 *   <->.         .
 *      t         .
 *  |---+---------|-------------|-----...
 *         i            i+1
 *
 * The sum of (e_1 + e_2) captures the depositor's total accumulated ETH gain, handling the case where their
 * deposit spanned one scale change. We only care about gains across one scale change, since the compounded
 * deposit is defined as being 0 once it has spanned more than one scale change.
 *
 *
 * --- UPDATING P WHEN A LIQUIDATION OCCURS ---
 *
 * Please see the implementation spec in the proof document, which closely follows on from the compounded deposit / ETH gain derivations:
 *
 *
 * --- ZKT ISSUANCE TO STABILITY POOL DEPOSITORS ---
 *
 * An ZKT issuance event occurs at every deposit operation, and every liquidation.
 *
 * Each deposit is tagged with the address of the front end through which it was made.
 *
 * All deposits earn a share of the issued ZKT in proportion to the deposit as a share of total deposits. The ZKT earned
 * by a given deposit, is split between the depositor and the front end through which the deposit was made, based on the front end's kickbackRate.
 *
 * We use the same mathematical product-sum approach to track ZKT gains for depositors, where 'G' is the sum corresponding to ZKT gains.
 * The product P (and snapshot P_t) is re-used, as the ratio P/P_t tracks a deposit's depletion due to liquidations.
 *
 */
contract StabilityPool is
    IStabilityPool,
    ZKTProtocolBase,
    CheckContract,
    Ownable
{
    using SafeMath for uint256;

    string public constant NAME = "StabilityPool";

    IBorrowerOperations public borrowerOperations;

    ITroveManager public troveManager;

    IZKUSDToken public zkusdToken;

    // Needed to check if there are pending liquidations
    ISortedTroves public sortedTroves;

    ICommunityIssuance public communityIssuance;

    uint256 internal ETH; // deposited conflux tracker

    // Tracker for ZKUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
    uint256 internal totalZKUSDDeposits;

    // --- Data structures ---

    struct Snapshots {
        uint256 S;
        uint256 P;
        uint256 G;
        uint256 scale;
        uint256 epoch;
    }

    mapping(address => uint256) public deposits; // depositor address -> Deposit struct
    mapping(address => Snapshots) public depositSnapshots; // depositor address -> snapshots struct

    // remove frontEnd and use adminVault instead, each FrontEnds is treasury address with 99.9% kickbackRate
    address public treasury;
    uint256 public constant DefaultKickbackRate =
        DECIMAL_PRECISION - (10 * DECIMAL_PRECISION) / 1000;

    mapping(address => uint256) public frontEndStakes; // depositer address (front end address)[expired] -> last recorded total deposits, tagged with that front end
    mapping(address => Snapshots) public frontEndSnapshots; // depositer address (front end address)[expired] -> snapshots struct

    /*  Product 'P': Running product by which to multiply an initial deposit, in order to find the current compounded deposit,
     * after a series of liquidations have occurred, each of which cancel some ZKUSD debt with the deposit.
     *
     * During its lifetime, a deposit's value evolves from d_t to d_t * P / P_t , where P_t
     * is the snapshot of P taken at the instant the deposit was made. 18-digit decimal.
     */
    uint256 public P = DECIMAL_PRECISION;

    uint256 public constant SCALE_FACTOR = 1e9;

    // Each time the scale of P shifts by SCALE_FACTOR, the scale is incremented by 1
    uint256 public currentScale;

    // With each offset that fully empties the Pool, the epoch is incremented by 1
    uint256 public currentEpoch;

    /* ETH Gain sum 'S': During its lifetime, each deposit d_t earns an ETH gain of ( d_t * [S - S_t] )/P_t, where S_t
     * is the depositor's snapshot of S taken at the time t when the deposit was made.
     *
     * The 'S' sums are stored in a nested mapping (epoch => scale => sum):
     *
     * - The inner mapping records the sum S at different scales
     * - The outer mapping records the (scale => sum) mappings, for different epochs.
     */
    mapping(uint256 => mapping(uint256 => uint256)) public epochToScaleToSum;

    /*
     * Similarly, the sum 'G' is used to calculate ZKT gains. During it's lifetime, each deposit d_t earns a ZKT gain of
     *  ( d_t * [G - G_t] )/P_t, where G_t is the depositor's snapshot of G taken at time t when  the deposit was made.
     *
     *  ZKT reward events occur are triggered by depositor operations (new deposit, topup, withdrawal), and liquidations.
     *  In each case, the ZKT reward is issued (i.e. G is updated), before other state changes are made.
     */
    mapping(uint256 => mapping(uint256 => uint256)) public epochToScaleToG;

    // Error tracker for the error correction in the ZKT issuance calculation
    uint256 public lastZKTError;
    // Error trackers for the error correction in the offset calculation
    uint256 public lastETHError_Offset;
    uint256 public lastZKUSDLossError_Offset;

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _zkusdTokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _communityIssuanceAddress,
        address _treasuryAddress
    ) external override onlyOwner {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_zkusdTokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_priceFeedAddress);
        checkContract(_communityIssuanceAddress);

        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        zkusdToken = IZKUSDToken(_zkusdTokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        communityIssuance = ICommunityIssuance(_communityIssuanceAddress);
        treasury = _treasuryAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit ZKUSDTokenAddressChanged(_zkusdTokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit CommunityIssuanceAddressChanged(_communityIssuanceAddress);

        //renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    function getETH() external view override returns (uint256) {
        return ETH;
    }

    function getTotalZKUSDDeposits() external view override returns (uint256) {
        return totalZKUSDDeposits;
    }

    // --- External Depositor Functions ---

    /*  provideToSP():
     *
     * - Triggers a ZKT issuance, based on time passed since the last issuance. The ZKT issuance is shared between *all* depositors and front ends
     * - Tags the deposit with the provided front end tag param, if it's a new deposit
     * - Sends depositor's accumulated gains (ZKT, ETH) to depositor
     * - Sends the tagged front end's accumulated ZKT gains to the tagged front end
     * - Increases deposit and tagged front end's stake, and takes new snapshots for each.
     */
    function provideToSP(uint256 _amount) external override {
        _requireNonZeroAmount(_amount);

        uint256 initialDeposit = deposits[msg.sender];

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerZKTIssuance(communityIssuanceCached);

        uint256 depositorETHGain = getDepositorETHGain(msg.sender);
        uint256 compoundedZKUSDDeposit = getCompoundedZKUSDDeposit(msg.sender);
        uint256 ZKUSDLoss = initialDeposit.sub(compoundedZKUSDDeposit); // Needed only for event log

        // First pay out any ZKT gains
        _payOutZKTGains(communityIssuanceCached, msg.sender);

        // Update front end stake
        uint256 compoundedFrontEndStake = getCompoundedFrontEndStake(
            msg.sender
        );
        uint256 newFrontEndStake = compoundedFrontEndStake.add(_amount);
        _updateFrontEndStakeAndSnapshots(msg.sender, newFrontEndStake);
        emit FrontEndStakeChanged(msg.sender, newFrontEndStake, msg.sender);

        _sendZKUSDtoStabilityPool(msg.sender, _amount);

        uint256 newDeposit = compoundedZKUSDDeposit.add(_amount);
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit ETHGainWithdrawn(msg.sender, depositorETHGain, ZKUSDLoss); // ZKUSD Loss required for event log

        _sendETHGainToDepositor(depositorETHGain);
    }

    /*  withdrawFromSP():
     *
     * - Triggers a ZKT issuance, based on time passed since the last issuance. The ZKT issuance is shared between *all* depositors and front ends
     * - Removes the deposit's front end tag if it is a full withdrawal
     * - Sends all depositor's accumulated gains (ZKT, ETH) to depositor
     * - Sends the tagged front end's accumulated ZKT gains to the tagged front end
     * - Decreases deposit and tagged front end's stake, and takes new snapshots for each.
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint256 _amount) external override {
        if (_amount != 0) {
            _requireNoUnderCollateralizedTroves();
        }
        uint256 initialDeposit = deposits[msg.sender];
        _requireUserHasDeposit(initialDeposit);

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerZKTIssuance(communityIssuanceCached);

        uint256 depositorETHGain = getDepositorETHGain(msg.sender);

        uint256 compoundedZKUSDDeposit = getCompoundedZKUSDDeposit(msg.sender);
        uint256 ZKUSDtoWithdraw = Math.min(_amount, compoundedZKUSDDeposit);
        uint256 ZKUSDLoss = initialDeposit.sub(compoundedZKUSDDeposit); // Needed only for event log

        // First pay out any ZKT gains
        _payOutZKTGains(communityIssuanceCached, msg.sender);

        // Update front end stake
        uint256 compoundedFrontEndStake = getCompoundedFrontEndStake(
            msg.sender
        );
        uint256 newFrontEndStake = compoundedFrontEndStake.sub(ZKUSDtoWithdraw);
        _updateFrontEndStakeAndSnapshots(msg.sender, newFrontEndStake);
        emit FrontEndStakeChanged(msg.sender, newFrontEndStake, msg.sender);

        _sendZKUSDToDepositor(msg.sender, ZKUSDtoWithdraw);

        // Update deposit
        uint256 newDeposit = compoundedZKUSDDeposit.sub(ZKUSDtoWithdraw);
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit ETHGainWithdrawn(msg.sender, depositorETHGain, ZKUSDLoss); // ZKUSD Loss required for event log

        _sendETHGainToDepositor(depositorETHGain);
    }

    /* withdrawETHGainToTrove:
     * - Triggers a ZKT issuance, based on time passed since the last issuance. The ZKT issuance is shared between *all* depositors and front ends
     * - Sends all depositor's ZKT gain to  depositor
     * - Sends all tagged front end's ZKT gain to the tagged front end
     * - Transfers the depositor's entire ETH gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit and tagged front end stake */
    function withdrawETHGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external override {
        uint256 initialDeposit = deposits[msg.sender];
        _requireUserHasDeposit(initialDeposit);
        _requireUserHasTrove(msg.sender);
        _requireUserHasETHGain(msg.sender);

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerZKTIssuance(communityIssuanceCached);

        uint256 depositorETHGain = getDepositorETHGain(msg.sender);

        uint256 compoundedZKUSDDeposit = getCompoundedZKUSDDeposit(msg.sender);
        uint256 ZKUSDLoss = initialDeposit.sub(compoundedZKUSDDeposit); // Needed only for event log

        // First pay out any ZKT gains
        _payOutZKTGains(communityIssuanceCached, msg.sender);

        // Update front end stake
        uint256 compoundedFrontEndStake = getCompoundedFrontEndStake(
            msg.sender
        );
        uint256 newFrontEndStake = compoundedFrontEndStake;
        _updateFrontEndStakeAndSnapshots(msg.sender, newFrontEndStake);
        emit FrontEndStakeChanged(msg.sender, newFrontEndStake, msg.sender);

        _updateDepositAndSnapshots(msg.sender, compoundedZKUSDDeposit);

        /* Emit events before transferring ETH gain to Trove.
         This lets the event log make more sense (i.e. so it appears that first the ETH gain is withdrawn
        and then it is deposited into the Trove, not the other way around). */
        emit ETHGainWithdrawn(msg.sender, depositorETHGain, ZKUSDLoss);
        emit UserDepositChanged(msg.sender, compoundedZKUSDDeposit);

        ETH = ETH.sub(depositorETHGain);
        emit StabilityPoolETHBalanceUpdated(ETH);
        emit EtherSent(msg.sender, depositorETHGain);

        borrowerOperations.moveETHGainToTrove{value: depositorETHGain}(
            msg.sender,
            _upperHint,
            _lowerHint
        );
    }

    // --- ZKT issuance functions ---

    function _triggerZKTIssuance(
        ICommunityIssuance _communityIssuance
    ) internal {
        uint256 ZKTIssuance = _communityIssuance.issueZKT();
        _updateG(ZKTIssuance);
    }

    function _updateG(uint256 _ZKTIssuance) internal {
        uint256 totalZKUSD = totalZKUSDDeposits; // cached to save an SLOAD
        /*
         * When total deposits is 0, G is not updated. In this case, the ZKT issued can not be obtained by later
         * depositors - it is missed out on, and remains in the balanceof the CommunityIssuance contract.
         *
         */
        if (totalZKUSD == 0 || _ZKTIssuance == 0) {
            return;
        }

        uint256 ZKTPerUnitStaked;
        ZKTPerUnitStaked = _computeZKTPerUnitStaked(_ZKTIssuance, totalZKUSD);

        uint256 marginalZKTGain = ZKTPerUnitStaked.mul(P);
        epochToScaleToG[currentEpoch][currentScale] = epochToScaleToG[
            currentEpoch
        ][currentScale].add(marginalZKTGain);

        emit G_Updated(
            epochToScaleToG[currentEpoch][currentScale],
            currentEpoch,
            currentScale
        );
    }

    function _computeZKTPerUnitStaked(
        uint256 _ZKTIssuance,
        uint256 _totalZKUSDDeposits
    ) internal returns (uint256) {
        /*
         * Calculate the ZKT-per-unit staked.  Division uses a "feedback" error correction, to keep the
         * cumulative error low in the running total G:
         *
         * 1) Form a numerator which compensates for the floor division error that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratio.
         * 3) Multiply the ratio back by its denominator, to reveal the current floor division error.
         * 4) Store this error for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint256 ZKTNumerator = _ZKTIssuance.mul(DECIMAL_PRECISION).add(
            lastZKTError
        );

        uint256 ZKTPerUnitStaked = ZKTNumerator.div(_totalZKUSDDeposits);
        lastZKTError = ZKTNumerator.sub(
            ZKTPerUnitStaked.mul(_totalZKUSDDeposits)
        );

        return ZKTPerUnitStaked;
    }

    // --- Liquidation functions ---

    /*
     * Cancels out the specified debt against the ZKUSD contained in the Stability Pool (as far as possible)
     * and transfers the Trove's ETH collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(
        uint256 _debtToOffset,
        uint256 _collToAdd
    ) external override {
        _requireCallerIsTroveManager();
        uint256 totalZKUSD = totalZKUSDDeposits; // cached to save an SLOAD
        if (totalZKUSD == 0 || _debtToOffset == 0) {
            return;
        }

        _triggerZKTIssuance(communityIssuance);

        (
            uint256 ETHGainPerUnitStaked,
            uint256 ZKUSDLossPerUnitStaked
        ) = _computeRewardsPerUnitStaked(_collToAdd, _debtToOffset, totalZKUSD);

        _updateRewardSumAndProduct(
            ETHGainPerUnitStaked,
            ZKUSDLossPerUnitStaked
        ); // updates S and P

        _moveOffsetCollAndDebt(_collToAdd, _debtToOffset);
    }

    // --- Offset helper functions ---

    function _computeRewardsPerUnitStaked(
        uint256 _collToAdd,
        uint256 _debtToOffset,
        uint256 _totalZKUSDDeposits
    )
        internal
        returns (uint256 ETHGainPerUnitStaked, uint256 ZKUSDLossPerUnitStaked)
    {
        /*
         * Compute the ZKUSD and ETH rewards. Uses a "feedback" error correction, to keep
         * the cumulative error in the P and S state variables low:
         *
         * 1) Form numerators which compensate for the floor division errors that occurred the last time this
         * function was called.
         * 2) Calculate "per-unit-staked" ratios.
         * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
         * 4) Store these errors for use in the next correction when this function is called.
         * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
         */
        uint256 ETHNumerator = _collToAdd.mul(DECIMAL_PRECISION).add(
            lastETHError_Offset
        );

        assert(_debtToOffset <= _totalZKUSDDeposits);
        if (_debtToOffset == _totalZKUSDDeposits) {
            ZKUSDLossPerUnitStaked = DECIMAL_PRECISION; // When the Pool depletes to 0, so does each deposit
            lastZKUSDLossError_Offset = 0;
        } else {
            uint256 ZKUSDLossNumerator = _debtToOffset
                .mul(DECIMAL_PRECISION)
                .sub(lastZKUSDLossError_Offset);
            /*
             * Add 1 to make error in quotient positive. We want "slightly too much" ZKUSD loss,
             * which ensures the error in any given compoundedZKUSDDeposit favors the Stability Pool.
             */
            ZKUSDLossPerUnitStaked = (
                ZKUSDLossNumerator.div(_totalZKUSDDeposits)
            ).add(1);
            lastZKUSDLossError_Offset = (
                ZKUSDLossPerUnitStaked.mul(_totalZKUSDDeposits)
            ).sub(ZKUSDLossNumerator);
        }

        ETHGainPerUnitStaked = ETHNumerator.div(_totalZKUSDDeposits);
        lastETHError_Offset = ETHNumerator.sub(
            ETHGainPerUnitStaked.mul(_totalZKUSDDeposits)
        );

        return (ETHGainPerUnitStaked, ZKUSDLossPerUnitStaked);
    }

    // Update the Stability Pool reward sum S and product P
    function _updateRewardSumAndProduct(
        uint256 _ETHGainPerUnitStaked,
        uint256 _ZKUSDLossPerUnitStaked
    ) internal {
        uint256 currentP = P;
        uint256 newP;

        assert(_ZKUSDLossPerUnitStaked <= DECIMAL_PRECISION);
        /*
         * The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool ZKUSD in the liquidation.
         * We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - ZKUSDLossPerUnitStaked)
         */
        uint256 newProductFactor = uint256(DECIMAL_PRECISION).sub(
            _ZKUSDLossPerUnitStaked
        );

        uint256 currentScaleCached = currentScale;
        uint256 currentEpochCached = currentEpoch;
        uint256 currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];

        /*
         * Calculate the new S first, before we update P.
         * The ETH gain for any given depositor from a liquidation depends on the value of their deposit
         * (and the value of totalDeposits) prior to the Stability being depleted by the debt in the liquidation.
         *
         * Since S corresponds to ETH gain, and P to deposit loss, we update S first.
         */
        uint256 marginalETHGain = _ETHGainPerUnitStaked.mul(currentP);
        uint256 newS = currentS.add(marginalETHGain);
        epochToScaleToSum[currentEpochCached][currentScaleCached] = newS;
        emit S_Updated(newS, currentEpochCached, currentScaleCached);

        // If the Stability Pool was emptied, increment the epoch, and reset the scale and product P
        if (newProductFactor == 0) {
            currentEpoch = currentEpochCached.add(1);
            emit EpochUpdated(currentEpoch);
            currentScale = 0;
            emit ScaleUpdated(currentScale);
            newP = DECIMAL_PRECISION;

            // If multiplying P by a non-zero product factor would reduce P below the scale boundary, increment the scale
        } else if (
            currentP.mul(newProductFactor).div(DECIMAL_PRECISION) < SCALE_FACTOR
        ) {
            newP = currentP.mul(newProductFactor).mul(SCALE_FACTOR).div(
                DECIMAL_PRECISION
            );
            currentScale = currentScaleCached.add(1);
            emit ScaleUpdated(currentScale);
        } else {
            newP = currentP.mul(newProductFactor).div(DECIMAL_PRECISION);
        }

        assert(newP > 0);
        P = newP;

        emit P_Updated(newP);
    }

    function _moveOffsetCollAndDebt(
        uint256 _collToAdd,
        uint256 _debtToOffset
    ) internal {
        IActivePool activePoolCached = activePool;

        // Cancel the liquidated ZKUSD debt with the ZKUSD in the stability pool
        activePoolCached.decreaseZKUSDDebt(_debtToOffset);
        _decreaseZKUSD(_debtToOffset);

        // Burn the debt that was successfully offset
        zkusdToken.burn(address(this), _debtToOffset);

        activePoolCached.sendETH(address(this), _collToAdd);
    }

    function _decreaseZKUSD(uint256 _amount) internal {
        uint256 newTotalZKUSDDeposits = totalZKUSDDeposits.sub(_amount);
        totalZKUSDDeposits = newTotalZKUSDDeposits;
        emit StabilityPoolZKUSDBalanceUpdated(newTotalZKUSDDeposits);
    }

    // --- Reward calculator functions for depositor and front end ---

    /* Calculates the ETH gain earned by the deposit since its last snapshots were taken.
     * Given by the formula:  E = d0 * (S - S(0))/P(0)
     * where S(0) and P(0) are the depositor's snapshots of the sum S and product P, respectively.
     * d0 is the last recorded deposit value.
     */
    function getDepositorETHGain(
        address _depositor
    ) public view override returns (uint256) {
        uint256 initialDeposit = deposits[_depositor];

        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint256 ETHGain = _getETHGainFromSnapshots(initialDeposit, snapshots);
        return ETHGain;
    }

    function _getETHGainFromSnapshots(
        uint256 initialDeposit,
        Snapshots memory snapshots
    ) internal view returns (uint256) {
        /*
         * Grab the sum 'S' from the epoch at which the stake was made. The ETH gain may span up to one scale change.
         * If it does, the second portion of the ETH gain is scaled by 1e9.
         * If the gain spans no scale change, the second portion will be 0.
         */
        uint256 epochSnapshot = snapshots.epoch;
        uint256 scaleSnapshot = snapshots.scale;
        uint256 S_Snapshot = snapshots.S;
        uint256 P_Snapshot = snapshots.P;

        uint256 firstPortion = epochToScaleToSum[epochSnapshot][scaleSnapshot]
            .sub(S_Snapshot);
        uint256 secondPortion = epochToScaleToSum[epochSnapshot][
            scaleSnapshot.add(1)
        ].div(SCALE_FACTOR);

        uint256 ETHGain = initialDeposit
            .mul(firstPortion.add(secondPortion))
            .div(P_Snapshot)
            .div(DECIMAL_PRECISION);

        return ETHGain;
    }

    /*
     * Calculate the ZKT gain earned by a deposit since its last snapshots were taken.
     * Given by the formula:  ZKT = d0 * (G - G(0))/P(0)
     * where G(0) and P(0) are the depositor's snapshots of the sum G and product P, respectively.
     * d0 is the last recorded deposit value.
     */
    function getDepositorZKTGain(
        address _depositor
    ) public view override returns (uint256) {
        uint256 initialDeposit = deposits[_depositor];
        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint256 ZKTGain = DefaultKickbackRate
            .mul(_getZKTGainFromSnapshots(initialDeposit, snapshots))
            .div(DECIMAL_PRECISION);

        return ZKTGain;
    }

    /*
     * Return the ZKT gain earned by the front end. Given by the formula:  E = D0 * (G - G(0))/P(0)
     * where G(0) and P(0) are the depositor's snapshots of the sum G and product P, respectively.
     *
     * D0 is the last recorded value of the front end's total tagged deposits.
     */
    function getFrontEndZKTGain(
        address _frontEnd
    ) public view override returns (uint256) {
        uint256 frontEndStake = frontEndStakes[_frontEnd];
        if (frontEndStake == 0) {
            return 0;
        }

        uint256 frontEndShare = uint256(DECIMAL_PRECISION).sub(
            DefaultKickbackRate
        );

        Snapshots memory snapshots = frontEndSnapshots[_frontEnd];

        uint256 ZKTGain = frontEndShare
            .mul(_getZKTGainFromSnapshots(frontEndStake, snapshots))
            .div(DECIMAL_PRECISION);
        return ZKTGain;
    }

    function _getZKTGainFromSnapshots(
        uint256 initialStake,
        Snapshots memory snapshots
    ) internal view returns (uint256) {
        /*
         * Grab the sum 'G' from the epoch at which the stake was made. The ZKT gain may span up to one scale change.
         * If it does, the second portion of the ZKT gain is scaled by 1e9.
         * If the gain spans no scale change, the second portion will be 0.
         */
        uint256 epochSnapshot = snapshots.epoch;
        uint256 scaleSnapshot = snapshots.scale;
        uint256 G_Snapshot = snapshots.G;
        uint256 P_Snapshot = snapshots.P;

        uint256 firstPortion = epochToScaleToG[epochSnapshot][scaleSnapshot]
            .sub(G_Snapshot);
        uint256 secondPortion = epochToScaleToG[epochSnapshot][
            scaleSnapshot.add(1)
        ].div(SCALE_FACTOR);

        uint256 ZKTGain = initialStake
            .mul(firstPortion.add(secondPortion))
            .div(P_Snapshot)
            .div(DECIMAL_PRECISION);

        return ZKTGain;
    }

    // --- Compounded deposit and compounded front end stake ---

    /*
     * Return the user's compounded deposit. Given by the formula:  d = d0 * P/P(0)
     * where P(0) is the depositor's snapshot of the product P, taken when they last updated their deposit.
     */
    function getCompoundedZKUSDDeposit(
        address _depositor
    ) public view override returns (uint256) {
        uint256 initialDeposit = deposits[_depositor];
        if (initialDeposit == 0) {
            return 0;
        }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint256 compoundedDeposit = _getCompoundedStakeFromSnapshots(
            initialDeposit,
            snapshots
        );
        return compoundedDeposit;
    }

    /*
     * Return the front end's compounded stake. Given by the formula:  D = D0 * P/P(0)
     * where P(0) is the depositor's snapshot of the product P, taken at the last time
     * when one of the front end's tagged deposits updated their deposit.
     *
     * The front end's compounded stake is equal to the sum of its depositors' compounded deposits.
     */
    function getCompoundedFrontEndStake(
        address _frontEnd
    ) public view override returns (uint256) {
        uint256 frontEndStake = frontEndStakes[_frontEnd];
        if (frontEndStake == 0) {
            return 0;
        }

        Snapshots memory snapshots = frontEndSnapshots[_frontEnd];

        uint256 compoundedFrontEndStake = _getCompoundedStakeFromSnapshots(
            frontEndStake,
            snapshots
        );
        return compoundedFrontEndStake;
    }

    // Internal function, used to calculcate compounded deposits and compounded front end stakes.
    function _getCompoundedStakeFromSnapshots(
        uint256 initialStake,
        Snapshots memory snapshots
    ) internal view returns (uint256) {
        uint256 snapshot_P = snapshots.P;
        uint256 scaleSnapshot = snapshots.scale;
        uint256 epochSnapshot = snapshots.epoch;

        // If stake was made before a pool-emptying event, then it has been fully cancelled with debt -- so, return 0
        if (epochSnapshot < currentEpoch) {
            return 0;
        }

        uint256 compoundedStake;
        uint256 scaleDiff = currentScale.sub(scaleSnapshot);

        /* Compute the compounded stake. If a scale change in P was made during the stake's lifetime,
         * account for it. If more than one scale change was made, then the stake has decreased by a factor of
         * at least 1e-9 -- so return 0.
         */
        if (scaleDiff == 0) {
            compoundedStake = initialStake.mul(P).div(snapshot_P);
        } else if (scaleDiff == 1) {
            compoundedStake = initialStake.mul(P).div(snapshot_P).div(
                SCALE_FACTOR
            );
        } else {
            // if scaleDiff >= 2
            compoundedStake = 0;
        }

        /*
         * If compounded deposit is less than a billionth of the initial deposit, return 0.
         *
         * NOTE: originally, this line was in place to stop rounding errors making the deposit too large. However, the error
         * corrections should ensure the error in P "favors the Pool", i.e. any given compounded deposit should slightly less
         * than it's theoretical value.
         *
         * Thus it's unclear whether this line is still really needed.
         */
        if (compoundedStake < initialStake.div(1e9)) {
            return 0;
        }

        return compoundedStake;
    }

    // --- Sender functions for ZKUSD deposit, ETH gains and ZKT gains ---

    // Transfer the ZKUSD tokens from the user to the Stability Pool's address, and update its recorded ZKUSD
    function _sendZKUSDtoStabilityPool(
        address _address,
        uint256 _amount
    ) internal {
        zkusdToken.sendToPool(_address, address(this), _amount);
        uint256 newTotalZKUSDDeposits = totalZKUSDDeposits.add(_amount);
        totalZKUSDDeposits = newTotalZKUSDDeposits;
        emit StabilityPoolZKUSDBalanceUpdated(newTotalZKUSDDeposits);
    }

    function _sendETHGainToDepositor(uint256 _amount) internal {
        if (_amount == 0) {
            return;
        }
        uint256 newETH = ETH.sub(_amount);
        ETH = newETH;
        emit StabilityPoolETHBalanceUpdated(newETH);
        emit EtherSent(msg.sender, _amount);

        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "StabilityPool: sending ETH failed");
    }

    // Send ZKUSD to user and decrease ZKUSD in Pool
    function _sendZKUSDToDepositor(
        address _depositor,
        uint256 ZKUSDWithdrawal
    ) internal {
        if (ZKUSDWithdrawal == 0) {
            return;
        }

        zkusdToken.returnFromPool(address(this), _depositor, ZKUSDWithdrawal);
        _decreaseZKUSD(ZKUSDWithdrawal);
    }

    // --- External Front End functions ---

    function _updateDepositAndSnapshots(
        address _depositor,
        uint256 _newValue
    ) internal {
        deposits[_depositor] = _newValue;

        if (_newValue == 0) {
            delete depositSnapshots[_depositor];
            emit DepositSnapshotUpdated(_depositor, 0, 0, 0);
            return;
        }
        uint256 currentScaleCached = currentScale;
        uint256 currentEpochCached = currentEpoch;
        uint256 currentP = P;

        // Get S and G for the current epoch and current scale
        uint256 currentS = epochToScaleToSum[currentEpochCached][
            currentScaleCached
        ];
        uint256 currentG = epochToScaleToG[currentEpochCached][
            currentScaleCached
        ];

        // Record new snapshots of the latest running product P, sum S, and sum G, for the depositor
        depositSnapshots[_depositor].P = currentP;
        depositSnapshots[_depositor].S = currentS;
        depositSnapshots[_depositor].G = currentG;
        depositSnapshots[_depositor].scale = currentScaleCached;
        depositSnapshots[_depositor].epoch = currentEpochCached;

        emit DepositSnapshotUpdated(_depositor, currentP, currentS, currentG);
    }

    function _updateFrontEndStakeAndSnapshots(
        address _frontEnd,
        uint256 _newValue
    ) internal {
        frontEndStakes[_frontEnd] = _newValue;

        if (_newValue == 0) {
            delete frontEndSnapshots[_frontEnd];
            emit FrontEndSnapshotUpdated(_frontEnd, 0, 0);
            return;
        }

        uint256 currentScaleCached = currentScale;
        uint256 currentEpochCached = currentEpoch;
        uint256 currentP = P;

        // Get G for the current epoch and current scale
        uint256 currentG = epochToScaleToG[currentEpochCached][
            currentScaleCached
        ];

        // Record new snapshots of the latest running product P and sum G for the front end
        frontEndSnapshots[_frontEnd].P = currentP;
        frontEndSnapshots[_frontEnd].G = currentG;
        frontEndSnapshots[_frontEnd].scale = currentScaleCached;
        frontEndSnapshots[_frontEnd].epoch = currentEpochCached;

        emit FrontEndSnapshotUpdated(_frontEnd, currentP, currentG);
    }

    function _payOutZKTGains(
        ICommunityIssuance _communityIssuance,
        address _depositor
    ) internal {
        // Pay out front end's ZKT gain
        uint256 frontEndZKTGain = getFrontEndZKTGain(_depositor);
        _communityIssuance.sendZKT(treasury, frontEndZKTGain);
        emit ZKTPaidToFrontEnd(treasury, frontEndZKTGain);

        // Pay out depositor's ZKT gain
        uint256 depositorZKTGain = getDepositorZKTGain(_depositor);
        _communityIssuance.sendZKT(_depositor, depositorZKTGain);
        emit ZKTPaidToDepositor(_depositor, depositorZKTGain);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(
            msg.sender == address(activePool),
            "StabilityPool: Caller is not ActivePool"
        );
    }

    function _requireCallerIsTroveManager() internal view {
        require(
            msg.sender == address(troveManager),
            "StabilityPool: Caller is not TroveManager"
        );
    }

    function _requireNoUnderCollateralizedTroves() internal {
        uint256 price = priceFeed.fetchPrice();
        address lowestTrove = sortedTroves.getLast();
        uint256 ICR = troveManager.getCurrentICR(lowestTrove, price);
        require(
            ICR >= MCR,
            "StabilityPool: Cannot withdraw while there are troves with ICR < MCR"
        );
    }

    function _requireUserHasDeposit(uint256 _initialDeposit) internal pure {
        require(
            _initialDeposit > 0,
            "StabilityPool: User must have a non-zero deposit"
        );
    }

    function _requireUserHasNoDeposit(address _address) internal view {
        uint256 initialDeposit = deposits[_address];
        require(
            initialDeposit == 0,
            "StabilityPool: User must have no deposit"
        );
    }

    function _requireNonZeroAmount(uint256 _amount) internal pure {
        require(_amount > 0, "StabilityPool: Amount must be non-zero");
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) == 1,
            "StabilityPool: caller must have an active trove to withdraw ETHGain to"
        );
    }

    function _requireUserHasETHGain(address _depositor) internal view {
        uint256 ETHGain = getDepositorETHGain(_depositor);
        require(
            ETHGain > 0,
            "StabilityPool: caller must have non-zero ETH Gain"
        );
    }

    function _requireValidKickbackRate(uint256 _kickbackRate) internal pure {
        require(
            _kickbackRate <= DECIMAL_PRECISION,
            "StabilityPool: Kickback rate must be in range [0,1]"
        );
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        ETH = ETH.add(msg.value);
        emit StabilityPoolETHBalanceUpdated(ETH);
    }
}
