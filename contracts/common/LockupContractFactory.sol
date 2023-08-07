// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../interfaces/ILockupContractFactory.sol";
import "../dependencies/CheckContract.sol";
import "./LockupContract.sol";

/*
 * The LockupContractFactory deploys LockupContracts - its main purpose is to keep a registry of valid deployed
 * LockupContracts.
 *
 * This registry is checked by ZKToken when the Liquity deployer attempts to transfer ZKT tokens. During the first year
 * since system deployment, the Liquity deployer is only allowed to transfer ZKT to valid LockupContracts that have been
 * deployed by and recorded in the LockupContractFactory. This ensures the deployer's ZKT can't be traded or staked in the
 * first year, and can only be sent to a verified LockupContract which unlocks at least one year after system deployment.
 *
 * LockupContracts can of course be deployed directly, but only those deployed through and recorded in the LockupContractFactory
 * will be considered "valid" by ZKToken. This is a convenient way to verify that the target address is a genuine
 * LockupContract.
 */

contract LockupContractFactory is
    ILockupContractFactory,
    Ownable,
    CheckContract
{
    using SafeMath for uint256;

    // --- Data ---
    string public constant NAME = "LockupContractFactory";

    uint256 public constant SECONDS_IN_ONE_YEAR = 31536000;

    address public zkTokenAddress;

    mapping(address => address) public lockupContractToDeployer;

    // --- Functions ---

    function setZKTokenAddress(
        address _zkTokenAddress
    ) external override onlyOwner {
        checkContract(_zkTokenAddress);

        zkTokenAddress = _zkTokenAddress;
        emit ZKTokenAddressSet(_zkTokenAddress);

        //renounceOwnership();
    }

    function deployLockupContract(
        address _beneficiary,
        uint256 _unlockTime
    ) external override {
        address zkTokenAddressCached = zkTokenAddress;
        _requireZKTAddressIsSet(zkTokenAddressCached);
        LockupContract lockupContract = new LockupContract(
            zkTokenAddressCached,
            _beneficiary,
            _unlockTime
        );

        lockupContractToDeployer[address(lockupContract)] = msg.sender;
        emit LockupContractDeployedThroughFactory(
            address(lockupContract),
            _beneficiary,
            _unlockTime,
            msg.sender
        );
    }

    function isRegisteredLockup(
        address _contractAddress
    ) public view override returns (bool) {
        return lockupContractToDeployer[_contractAddress] != address(0);
    }

    // --- 'require'  functions ---
    function _requireZKTAddressIsSet(address _zkTokenAddress) internal pure {
        require(_zkTokenAddress != address(0), "LCF: ZKT Address is not set");
    }
}
