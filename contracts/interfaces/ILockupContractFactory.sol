// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILockupContractFactory {
    // --- Events ---

    event ZKTokenAddressSet(address _zkTokenAddress);
    event LockupContractDeployedThroughFactory(
        address _lockupContractAddress,
        address _beneficiary,
        uint256 _unlockTime,
        address _deployer
    );

    // --- Functions ---

    function setZKTokenAddress(address _zkTokenAddress) external;

    function deployLockupContract(
        address _beneficiary,
        uint256 _unlockTime
    ) external;

    function isRegisteredLockup(address _addr) external view returns (bool);
}
