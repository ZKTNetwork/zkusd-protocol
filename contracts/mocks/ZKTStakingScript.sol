// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IZKTStaking.sol";
import "../dependencies/CheckContract.sol";

contract ZKTStakingScript is CheckContract {
    IZKTStaking immutable ZKTStaking;

    constructor(address _zktStakingAddress) public {
        checkContract(_zktStakingAddress);
        ZKTStaking = IZKTStaking(_zktStakingAddress);
    }

    function stake(uint _ZKTamount) external {
        ZKTStaking.stake(_ZKTamount);
    }
}
