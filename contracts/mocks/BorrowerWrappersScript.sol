// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./BorrowerOperationsScript.sol";
import "./NEONTransferScript.sol";
import "./ZKTStakingScript.sol";
import "../dependencies/FullMath.sol";
import "../interfaces/ITroveManager.sol";
import "../interfaces/IStabilityPool.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IZKTStaking.sol";

contract BorrowerWrappersScript is
    BorrowerOperationsScript,
    NEONTransferScript,
    ZKTStakingScript
{
    using SafeMath for uint;

    string public constant NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable zkusdToken;
    IERC20 immutable zkToken;
    IZKTStaking immutable zktStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _zktStakingAddress,
        address _priceFeed
    )
        BorrowerOperationsScript(
            IBorrowerOperations(_borrowerOperationsAddress)
        )
        ZKTStakingScript(_zktStakingAddress)
    {
        checkContract(_troveManagerAddress);
        ITroveManager troveManagerCached = ITroveManager(_troveManagerAddress);
        troveManager = troveManagerCached;

        IStabilityPool stabilityPoolCached = troveManagerCached.stabilityPool();
        checkContract(address(stabilityPoolCached));
        stabilityPool = stabilityPoolCached;

        checkContract(address(_priceFeed));
        priceFeed = IPriceFeed(_priceFeed);

        address zkusdTokenCached = address(troveManagerCached.zkusdToken());
        checkContract(zkusdTokenCached);
        zkusdToken = IERC20(zkusdTokenCached);

        address zkTokenCached = address(troveManagerCached.zkToken());
        checkContract(zkTokenCached);
        zkToken = IERC20(zkTokenCached);

        IZKTStaking zktStakingCached = troveManagerCached.zktStaking();
        require(
            _zktStakingAddress == address(zktStakingCached),
            "BorrowerWrappersScript: Wrong ZKTStaking address"
        );
        zktStaking = zktStakingCached;
    }

    function claimCollateralAndOpenTrove(
        uint _maxFee,
        uint _ZKUSDAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove{value: totalCollateral}(
            _maxFee,
            _ZKUSDAmount,
            _upperHint,
            _lowerHint
        );
    }

    function claimSPRewardsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint zktBalanceBefore = zkToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint zktBalanceAfter = zkToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed NEON to trove, get more ZKUSD and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint ZKUSDAmount = _getNetZKUSDAmount(claimedCollateral);
            borrowerOperations.adjustTrove{value: claimedCollateral}(
                _maxFee,
                0,
                ZKUSDAmount,
                true,
                _upperHint,
                _lowerHint
            );
            // Provide withdrawn ZKUSD to Stability Pool
            if (ZKUSDAmount > 0) {
                stabilityPool.provideToSP(ZKUSDAmount);
            }
        }

        // Stake claimed ZKT
        uint claimedZKT = zktBalanceAfter.sub(zktBalanceBefore);
        if (claimedZKT > 0) {
            zktStaking.stake(claimedZKT);
        }
    }

    function claimStakingGainsAndRecycle(
        uint _maxFee,
        address _upperHint,
        address _lowerHint
    ) external {
        uint collBalanceBefore = address(this).balance;
        uint zkusdBalanceBefore = zkusdToken.balanceOf(address(this));
        uint zktBalanceBefore = zkToken.balanceOf(address(this));

        // Claim gains
        zktStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedZKUSD = zkusdToken.balanceOf(address(this)).sub(
            zkusdBalanceBefore
        );

        uint netZKUSDAmount;
        // Top up trove and get more ZKUSD, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netZKUSDAmount = _getNetZKUSDAmount(gainedCollateral);
            borrowerOperations.adjustTrove{value: gainedCollateral}(
                _maxFee,
                0,
                netZKUSDAmount,
                true,
                _upperHint,
                _lowerHint
            );
        }

        uint totalZKUSD = gainedZKUSD.add(netZKUSDAmount);
        if (totalZKUSD > 0) {
            stabilityPool.provideToSP(totalZKUSD);

            // Providing to Stability Pool also triggers ZKT claim, so stake it if any
            uint zktBalanceAfter = zkToken.balanceOf(address(this));
            uint claimedZKT = zktBalanceAfter.sub(zktBalanceBefore);
            if (claimedZKT > 0) {
                zktStaking.stake(claimedZKT);
            }
        }
    }

    function _getNetZKUSDAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint ZKUSDAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay();
        uint netDebt = ZKUSDAmount.mul(FullMath.DECIMAL_PRECISION).div(
            FullMath.DECIMAL_PRECISION.add(borrowingRate)
        );

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(
            troveManager.getTroveStatus(_depositor) == 1,
            "BorrowerWrappersScript: caller must have an active trove"
        );
    }
}
