// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/IZKToken.sol";

/*
* The lockup contract architecture utilizes a single LockupContract, with an unlockTime. The unlockTime is passed as an argument
* to the LockupContract's constructor. The contract's balance can be withdrawn by the beneficiary when block.timestamp > unlockTime.
* At construction, the contract checks that unlockTime is at least one year later than the Liquity system's deployment time.

* Within the first year from deployment, the deployer of the ZKToken (Liquity AG's address) may transfer ZKT only to valid
* LockupContracts, and no other addresses (this is enforced in ZKToken.sol's transfer() function).
*
* The above two restrictions ensure that until one year after system deployment, ZKT tokens originating from Liquity AG cannot
* enter circulating supply and cannot be staked to earn system revenue.
*/
contract LockupContract {
    using SafeMath for uint256;

    // --- Data ---
    string public constant NAME = "LockupContract";

    uint256 public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public immutable beneficiary;

    IZKToken public zkToken;

    // Unlock time is the Unix point in time at which the beneficiary can withdraw.
    uint256 public unlockTime;

    // --- Events ---

    event LockupContractCreated(address _beneficiary, uint256 _unlockTime);
    event LockupContractEmptied(uint256 _ZKTwithdrawal);

    // --- Functions ---

    constructor(
        address _zkTokenAddress,
        address _beneficiary,
        uint256 _unlockTime
    ) {
        zkToken = IZKToken(_zkTokenAddress);

        /*
         * Set the unlock time to a chosen instant in the future, as long as it is at least 1 year after
         * the system was deployed
         */
        _requireUnlockTimeIsAtLeastOneYearAfterSystemDeployment(_unlockTime);
        unlockTime = _unlockTime;

        beneficiary = _beneficiary;
        emit LockupContractCreated(_beneficiary, _unlockTime);
    }

    function withdrawZKT() external {
        _requireCallerIsBeneficiary();
        _requireLockupDurationHasPassed();

        IZKToken zkTokenCached = zkToken;
        uint256 ZKTBalance = zkTokenCached.balanceOf(address(this));
        zkTokenCached.transfer(beneficiary, ZKTBalance);
        emit LockupContractEmptied(ZKTBalance);
    }

    // --- 'require' functions ---

    function _requireCallerIsBeneficiary() internal view {
        require(
            msg.sender == beneficiary,
            "LockupContract: caller is not the beneficiary"
        );
    }

    function _requireLockupDurationHasPassed() internal view {
        require(
            block.timestamp >= unlockTime,
            "LockupContract: The lockup duration must have passed"
        );
    }

    function _requireUnlockTimeIsAtLeastOneYearAfterSystemDeployment(
        uint256 _unlockTime
    ) internal view {
        uint256 systemDeploymentTime = zkToken.getDeploymentStartTime();
        require(
            _unlockTime >= systemDeploymentTime.add(SECONDS_IN_ONE_YEAR),
            "LockupContract: unlock time must be at least one year after system deployment"
        );
    }
}
