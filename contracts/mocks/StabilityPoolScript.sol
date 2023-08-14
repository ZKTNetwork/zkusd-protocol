// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../dependencies/CheckContract.sol";
import "../interfaces/IStabilityPool.sol";

contract StabilityPoolScript is CheckContract {
    string public constant NAME = "StabilityPoolScript";

    IStabilityPool immutable stabilityPool;

    constructor(IStabilityPool _stabilityPool) {
        checkContract(address(_stabilityPool));
        stabilityPool = _stabilityPool;
    }

    function provideToSP(uint _amount) external {
        stabilityPool.provideToSP(_amount);
    }

    function withdrawFromSP(uint _amount) external {
        stabilityPool.withdrawFromSP(_amount);
    }

    function withdrawNEONGainToTrove(
        address _upperHint,
        address _lowerHint
    ) external {
        stabilityPool.withdrawNEONGainToTrove(_upperHint, _lowerHint);
    }
}
