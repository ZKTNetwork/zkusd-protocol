// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../dependencies/FullMath.sol";

contract LiquityMathTester {
    function callMax(uint _a, uint _b) external pure returns (uint) {
        return Math.max(_a, _b);
    }

    // Non-view wrapper for gas test
    function callDecPowTx(uint _base, uint _n) external returns (uint) {
        return FullMath._decPow(_base, _n);
    }

    // External wrapper
    function callDecPow(uint _base, uint _n) external pure returns (uint) {
        return FullMath._decPow(_base, _n);
    }
}
