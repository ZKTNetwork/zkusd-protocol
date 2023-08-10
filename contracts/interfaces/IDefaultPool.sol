// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolZKUSDDebtUpdated(uint256 _ZKUSDDebt);
    event DefaultPoolETHBalanceUpdated(uint256 _ETH);

    // --- Functions ---
    function sendETHToActivePool(uint256 _amount) external;
}
