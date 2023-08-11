// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../common/ZKToken.sol";

contract ZKTokenTester is ZKToken {
    constructor(
        address _communityIssuanceAddress,
        address _zktStakingAddress,
        address _lockupFactoryAddress,
        address _bountyAddress,
        address _lpRewardsAddress,
        address _multisigAddress
    )
        ZKToken(
            _communityIssuanceAddress,
            _zktStakingAddress,
            _lockupFactoryAddress,
            _bountyAddress,
            _lpRewardsAddress,
            _multisigAddress
        )
    {}

    function unprotectedMint(address account, uint256 amount) external {
        // No check for the caller here

        _mint(account, amount);
    }

    function unprotectedSendToZKTStaking(
        address _sender,
        uint256 _amount
    ) external {
        // No check for the caller here

        if (_isFirstYear()) {
            _requireSenderIsNotMultisig(_sender);
        }
        _transfer(_sender, zktStakingAddress, _amount);
    }

    function callInternalApprove(
        address owner,
        address spender,
        uint256 amount
    ) external returns (bool) {
        _approve(owner, spender, amount);
        return true;
    }

    function callInternalTransfer(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        _transfer(sender, recipient, amount);
        return true;
    }

    function getChainId() external view returns (uint256 chainID) {
        //return _chainID(); // it’s private
        assembly {
            chainID := chainid()
        }
    }
}
