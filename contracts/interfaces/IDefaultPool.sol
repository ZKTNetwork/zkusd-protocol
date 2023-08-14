// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IPool.sol";

interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolZKUSDDebtUpdated(uint256 _ZKUSDDebt);
    event DefaultPoolNEONBalanceUpdated(uint256 _NEON);

    // --- Functions ---
    function sendNEONToActivePool(uint256 _amount) external;
}
