// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../protocol/DefaultPool.sol";

contract DefaultPoolTester is DefaultPool {
    using SafeMath for uint256;

    function unprotectedIncreaseZKUSDDebt(uint _amount) external {
        ZKUSDDebt = ZKUSDDebt.add(_amount);
    }

    function unprotectedPayable() external payable {
        NEON = NEON.add(msg.value);
    }
}
