//// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../common/CommunityIssuance.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    using SafeMath for uint256;

    function obtainZKT(uint _amount) external {
        zkToken.transfer(msg.sender, _amount);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
        return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueZKT() external returns (uint) {
        // No checks on caller address

        uint latestTotalZKTIssued = ZKTSupplyCap
            .mul(_getCumulativeIssuanceFraction())
            .div(DECIMAL_PRECISION);
        uint issuance = latestTotalZKTIssued.sub(totalZKTIssued);

        totalZKTIssued = latestTotalZKTIssued;
        return issuance;
    }
}
