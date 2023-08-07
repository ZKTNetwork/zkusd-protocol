// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IZKToken is IERC20 {
    // --- Events ---

    event CommunityIssuanceAddressSet(address _communityIssuanceAddress);
    event ZKTStakingAddressSet(address _zktStakingAddress);
    event LockupContractFactoryAddressSet(
        address _lockupContractFactoryAddress
    );

    // --- Functions ---

    function sendToZKTStaking(address _sender, uint256 _amount) external;

    function getDeploymentStartTime() external view returns (uint256);

    function getLpRewardsEntitlement() external view returns (uint256);
}
