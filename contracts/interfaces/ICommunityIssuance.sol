// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ICommunityIssuance {
    // --- Events ---

    event ZKTokenAddressSet(address _zkTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalZKTIssuedUpdated(uint _totalZKTIssued);

    // --- Functions ---

    function setAddresses(
        address _zkTokenAddress,
        address _stabilityPoolAddress
    ) external;

    function issueZKT() external returns (uint);

    function sendZKT(address _account, uint _ZKTamount) external;
}
