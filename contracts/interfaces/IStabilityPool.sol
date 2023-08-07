// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/*
 * The Stability Pool holds ZKUSD tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its ZKUSD debt gets offset with
 * ZKUSD in the Stability Pool:  that is, the offset debt evaporates, and an equal amount of ZKUSD tokens in the Stability Pool is burned.
 *
 * Thus, a liquidation causes each depositor to receive a ZKUSD loss, in proportion to their deposit as a share of total deposits.
 * They also receive an NEON gain, as the NEON collateral of the liquidated trove is distributed among Stability depositors,
 * in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation that depletes 40%
 * of the total ZKUSD in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each liquidation depletes the deposit,
 * multiplying it by some factor in range ]0,1[
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
 */
interface IStabilityPool {
    // --- Events ---

    event StabilityPoolNEONBalanceUpdated(uint256 _newBalance);
    event StabilityPoolZKUSDBalanceUpdated(uint256 _newBalance);

    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event ZKUSDTokenAddressChanged(address _newZKUSDTokenAddress);
    event SortedTrovesAddressChanged(address _newSortedTrovesAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event CommunityIssuanceAddressChanged(address _newCommunityIssuanceAddress);

    event P_Updated(uint256 _P);
    event S_Updated(uint256 _S, uint256 _epoch, uint256 _scale);
    event G_Updated(uint256 _G, uint256 _epoch, uint256 _scale);
    event EpochUpdated(uint256 _currentEpoch);
    event ScaleUpdated(uint256 _currentScale);

    event FrontEndRegistered(address indexed _frontEnd, uint256 _kickbackRate);
    event FrontEndTagSet(address indexed _depositor, address indexed _frontEnd);

    event DepositSnapshotUpdated(
        address indexed _depositor,
        uint256 _P,
        uint256 _S,
        uint256 _G
    );
    event FrontEndSnapshotUpdated(
        address indexed _frontEnd,
        uint256 _P,
        uint256 _G
    );
    event UserDepositChanged(address indexed _depositor, uint256 _newDeposit);
    event FrontEndStakeChanged(
        address indexed _frontEnd,
        uint256 _newFrontEndStake,
        address _depositor
    );

    event NEONGainWithdrawn(
        address indexed _depositor,
        uint256 _NEON,
        uint256 _ZKUSDLoss
    );
    event ZKTPaidToDepositor(address indexed _depositor, uint256 _ZKT);
    event ZKTPaidToFrontEnd(address indexed _frontEnd, uint256 _ZKT);
    event NeonSent(address _to, uint256 _amount);

    // --- Functions ---

    /*
     * Called only once on init, to set addresses of other Liquity contracts
     * Callable only by owner, renounces ownership at the end
     */
    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _zkusdTokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _communityIssuanceAddress,
        address _vault
    ) external;

    /*
     * Initial checks:
     * - _amount is not zero
     * ---
     * - Triggers a ZKT issuance, based on time passed since the last issuance. The ZKT issuance is shared between *all* depositors and front ends
     * - Tags the deposit with the provided front end tag param, if it's a new deposit
     * - Sends depositor's accumulated gains (ZKT, NEON) to depositor
     * - Increases deposit and tagged front end's stake, and takes new snapshots for each.
     */
    function provideToSP(uint256 _amount) external;

    /*
     * Initial checks:
     * - _amount is zero or there are no under collateralized troves left in the system
     * - User has a non zero deposit
     * ---
     * - Triggers a ZKT issuance, based on time passed since the last issuance. The ZKT issuance is shared between *all* depositors and front ends
     * - Sends all depositor's accumulated gains (ZKT, NEON) to depositor
     * - Decreases deposit and tagged front end's stake, and takes new snapshots for each.
     *
     * If _amount > userDeposit, the user withdraws all of their compounded deposit.
     */
    function withdrawFromSP(uint256 _amount) external;

    /*
     * Initial checks:
     * - User has a non zero deposit
     * - User has an open trove
     * - User has some NEON gain
     * ---
     * - Triggers a ZKT issuance, based on time passed since the last issuance. The ZKT issuance is shared between *all* depositors
     * - Sends all depositor's ZKT gain to  depositor
     * - Transfers the depositor's entire NEON gain from the Stability Pool to the caller's trove
     * - Leaves their compounded deposit in the Stability Pool
     * - Updates snapshots for deposit and tagged
     */
    function withdrawNEONGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external;

    /*
     * Initial checks:
     * - Caller is TroveManager
     * ---
     * Cancels out the specified debt against the ZKUSD contained in the Stability Pool (as far as possible)
     * and transfers the Trove's NEON collateral from ActivePool to StabilityPool.
     * Only called by liquidation functions in the TroveManager.
     */
    function offset(uint256 _debt, uint256 _coll) external;

    /*
     * Returns the total amount of NEON held by the pool, accounted in an internal variable instead of `balance`,
     * to exclude edge cases like NEON received from a self-destruct.
     */
    function getNEON() external view returns (uint256);

    /*
     * Returns ZKUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
     */
    function getTotalZKUSDDeposits() external view returns (uint256);

    /*
     * Calculates the NEON gain earned by the deposit since its last snapshots were taken.
     */
    function getDepositorNEONGain(
        address _depositor
    ) external view returns (uint256);

    /*
     * Calculate the ZKT gain earned by a deposit since its last snapshots were taken.
     * The depositor gets a 99.9% cut of what their deposit earned.
     * Otherwise, their cut of the deposit's earnings is equal to the defaultKickbackRate
     * which they made their deposit.
     */
    function getDepositorZKTGain(
        address _depositor
    ) external view returns (uint256);

    /*
     * Return the ZKT gain earned by the front end(depositor).
     */
    function getFrontEndZKTGain(
        address _frontEnd
    ) external view returns (uint256);

    /*
     * Return the user's compounded deposit.
     */
    function getCompoundedZKUSDDeposit(
        address _depositor
    ) external view returns (uint256);

    /*
     * Return the front end's compounded stake.
     *
     * The front end's compounded stake is equal to the sum of its depositors' compounded deposits.
     */
    function getCompoundedFrontEndStake(
        address _frontEnd
    ) external view returns (uint256);

    /*
     * Fallback function
     * Only callable by Active Pool, it just accounts for NEON received
     * receive() external payable;
     */
}
