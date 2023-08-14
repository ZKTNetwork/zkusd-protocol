// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../common/ZKTStaking.sol";

contract ZKTStakingTester is ZKTStaking {
    constructor() ZKTStaking(msg.sender) {}

    function requireCallerIsTroveManager() external view {
        _requireCallerIsTroveManager();
    }
}
