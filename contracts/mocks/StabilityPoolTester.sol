// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../protocol/StabilityPool.sol";

contract StabilityPoolTester is StabilityPool {
    function unprotectedPayable() external payable {
        NEON = NEON + msg.value;
    }

    function setCurrentScale(uint128 _currentScale) external {
        currentScale = _currentScale;
    }

    function setTotalDeposits(uint _totalZKUSDDeposits) external {
        totalZKUSDDeposits = _totalZKUSDDeposits;
    }
}
