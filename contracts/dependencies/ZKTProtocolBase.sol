// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IActivePool.sol";
import "../interfaces/IDefaultPool.sol";
import "../interfaces/IPriceFeed.sol";
import "./FullMath.sol";

/*
 * Base contract for TroveManager, BorrowerOperations and StabilityPool. Contains global system constants and
 * common functions.
 */
abstract contract ZKTProtocolBase {
    using SafeMath for uint256;

    uint256 public constant DECIMAL_PRECISION = 1e18;

    uint256 public constant _100pct = 1000000000000000000; // 1e18 == 100%

    // Minimum collateral ratio for individual troves
    uint256 public constant MCR = 1100000000000000000; // 110%

    // Critical system collateral ratio. If the system's total collateral ratio (TCR) falls below the CCR, Recovery Mode is triggered.
    uint256 public constant CCR = 1500000000000000000; // 150%

    // Amount of ZKUSD to be locked in gas pool on opening troves
    uint256 public constant ZKUSD_GAS_COMPENSATION = 50e18;

    // Minimum amount of net ZKUSD debt a trove must have
    uint256 public constant MIN_NET_DEBT = 500e18;

    uint256 public constant PERCENT_DIVISOR = ZKUSD_GAS_COMPENSATION / 1e18; // dividing by 200 yields 0.5%

    uint256 public constant BORROWING_FEE_FLOOR =
        (DECIMAL_PRECISION / 100000) * 5; // 0.005%

    IActivePool public activePool;

    IDefaultPool public defaultPool;

    IPriceFeed public priceFeed;

    // --- Gas compensation functions ---

    // Returns the composite debt (drawn debt + gas compensation) of a trove, for the purpose of ICR calculation
    function _getCompositeDebt(uint256 _debt) internal pure returns (uint256) {
        return _debt.add(ZKUSD_GAS_COMPENSATION);
    }

    function _getNetDebt(uint256 _debt) internal pure returns (uint256) {
        return _debt.sub(ZKUSD_GAS_COMPENSATION);
    }

    // Return the amount of NEON to be drawn from a trove's collateral and sent as gas compensation.
    function _getCollGasCompensation(
        uint256 _entireColl
    ) internal pure returns (uint256) {
        return _entireColl / PERCENT_DIVISOR;
    }

    function getEntireSystemColl()
        public
        view
        returns (uint256 entireSystemColl)
    {
        uint256 activeColl = activePool.getNEON();
        uint256 liquidatedColl = defaultPool.getNEON();

        return activeColl.add(liquidatedColl);
    }

    function getEntireSystemDebt()
        public
        view
        returns (uint256 entireSystemDebt)
    {
        uint256 activeDebt = activePool.getZKUSDDebt();
        uint256 closedDebt = defaultPool.getZKUSDDebt();

        return activeDebt.add(closedDebt);
    }

    function _getTCR(uint256 _price) internal view returns (uint256 TCR) {
        uint256 entireSystemColl = getEntireSystemColl();
        uint256 entireSystemDebt = getEntireSystemDebt();

        TCR = FullMath._computeCR(entireSystemColl, entireSystemDebt, _price);

        return TCR;
    }

    function _checkRecoveryMode(uint256 _price) internal view returns (bool) {
        uint256 TCR = _getTCR(_price);

        return TCR < CCR;
    }

    function _requireUserAcceptsFee(
        uint256 _fee,
        uint256 _amount,
        uint256 _maxFeePercentage
    ) internal pure {
        uint256 feePercentage = _fee.mul(DECIMAL_PRECISION).div(_amount);
        require(
            feePercentage <= _maxFeePercentage,
            "Fee exceeded provided maximum"
        );
    }
}
