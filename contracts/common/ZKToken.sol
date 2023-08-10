// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../dependencies/CheckContract.sol";
import "../dependencies/ERC2612Permit.sol";
import "../interfaces/IZKToken.sol";
import "../interfaces/ILockupContractFactory.sol";

contract ZKToken is IZKToken, CheckContract, ERC2612Permit {
    using SafeMath for uint256;

    uint256 public constant ONE_YEAR_IN_SECONDS = 31536000; // 60 * 60 * 24 * 365

    // uint256 for use with SafeMath
    uint256 internal _1_MILLION = 1e24; // 1e6 * 1e18 = 1e24

    uint256 internal immutable deploymentStartTime;

    address public immutable communityIssuanceAddress;
    address public immutable zktStakingAddress;

    uint256 internal immutable lpRewardsEntitlement;

    ILockupContractFactory public immutable lockupContractFactory;

    address public multisigAddress;

    constructor(
        address _communityIssuanceAddress,
        address _zktStakingAddress,
        address _lockupFactoryAddress,
        address _bountyAddress,
        address _lpRewardsAddress,
        address _multisigAddress
    ) ERC20("ZKToken", "ZKT") ERC2612Permit("ZKT") {
        checkContract(_communityIssuanceAddress);
        checkContract(_zktStakingAddress);
        checkContract(_lockupFactoryAddress);

        multisigAddress = _multisigAddress;
        deploymentStartTime = block.timestamp;

        communityIssuanceAddress = _communityIssuanceAddress;
        zktStakingAddress = _zktStakingAddress;
        lockupContractFactory = ILockupContractFactory(_lockupFactoryAddress);

        // --- Initial ZKT allocations ---

        uint256 bountyEntitlement = _1_MILLION.mul(2); // Allocate 2 million for bounties/hackathons
        _mint(_bountyAddress, bountyEntitlement);

        uint256 depositorsAndFrontEndsEntitlement = _1_MILLION.mul(32); // Allocate 32 million to the algorithmic issuance schedule
        _mint(_communityIssuanceAddress, depositorsAndFrontEndsEntitlement);

        uint256 _lpRewardsEntitlement = _1_MILLION.mul(4).div(3); // Allocate 1.33 million for LP rewards
        lpRewardsEntitlement = _lpRewardsEntitlement;
        if (_lpRewardsAddress == address(0)) {
            _mint(_multisigAddress, _lpRewardsEntitlement);
        } else {
            _mint(_lpRewardsAddress, _lpRewardsEntitlement);
        }

        // Allocate the remainder to the ZKT Multisig: (100 - 2 - 32 - 1.33) million = 64.66 million
        uint256 multisigEntitlement = _1_MILLION
            .mul(100)
            .sub(bountyEntitlement)
            .sub(depositorsAndFrontEndsEntitlement)
            .sub(_lpRewardsEntitlement);

        _mint(_multisigAddress, multisigEntitlement);
    }

    function getDeploymentStartTime() external view override returns (uint256) {
        return deploymentStartTime;
    }

    function getLpRewardsEntitlement()
        external
        view
        override
        returns (uint256)
    {
        return lpRewardsEntitlement;
    }

    function sendToZKTStaking(
        address _sender,
        uint256 _amount
    ) external override {
        _requireCallerIsZKTStaking();
        if (_isFirstYear()) {
            _requireSenderIsNotMultisig(_sender);
        } // Prevent the multisig from staking ZKT
        _transfer(_sender, zktStakingAddress, _amount);
    }

    function approve(
        address spender,
        uint256 amount
    ) public override(IERC20, ERC20) returns (bool) {
        if (_isFirstYear()) {
            _requireCallerIsNotMultisig();
        }

        return super.approve(spender, amount);
    }

    function transfer(
        address recipient,
        uint256 amount
    ) public override(IERC20, ERC20) returns (bool) {
        // Restrict the multisig's transfers in first year
        if (_callerIsMultisig() && _isFirstYear()) {
            _requireRecipientIsRegisteredLC(recipient);
        }

        _requireValidRecipient(recipient);

        // Otherwise, standard transfer functionality
        return super.transfer(recipient, amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override(IERC20, ERC20) returns (bool) {
        if (_isFirstYear()) {
            _requireSenderIsNotMultisig(sender);
        }

        _requireValidRecipient(recipient);

        return super.transferFrom(sender, recipient, amount);
    }

    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public override(ERC20) returns (bool) {
        if (_isFirstYear()) {
            _requireCallerIsNotMultisig();
        }

        return super.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public override(ERC20) returns (bool) {
        if (_isFirstYear()) {
            _requireCallerIsNotMultisig();
        }

        return super.decreaseAllowance(spender, subtractedValue);
    }

    // --- Helper functions ---

    function _callerIsMultisig() internal view returns (bool) {
        return (msg.sender == multisigAddress);
    }

    function _isFirstYear() internal view returns (bool) {
        return (block.timestamp.sub(deploymentStartTime) < ONE_YEAR_IN_SECONDS);
    }

    // --- 'require' functions ---

    function _requireValidRecipient(address _recipient) internal view {
        require(
            _recipient != address(0) && _recipient != address(this),
            "ZKT: Cannot transfer tokens directly to the ZK token contract or the zero address"
        );
        require(
            _recipient != communityIssuanceAddress &&
                _recipient != zktStakingAddress,
            "ZKT: Cannot transfer tokens directly to the community issuance or staking contract"
        );
    }

    function _requireRecipientIsRegisteredLC(address _recipient) internal view {
        require(
            lockupContractFactory.isRegisteredLockup(_recipient),
            "ZKToken: recipient must be a LockupContract registered in the Factory"
        );
    }

    function _requireSenderIsNotMultisig(address _sender) internal view {
        require(
            _sender != multisigAddress,
            "ZKToken: sender must not be the multisig"
        );
    }

    function _requireCallerIsNotMultisig() internal view {
        require(
            !_callerIsMultisig(),
            "ZKToken: caller must not be the multisig"
        );
    }

    function _requireCallerIsZKTStaking() internal view {
        require(
            msg.sender == zktStakingAddress,
            "ZKToken: caller must be the ZKTStaking contract"
        );
    }
}
