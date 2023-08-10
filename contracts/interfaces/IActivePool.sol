// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IPool.sol";

interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(
        address _newBorrowerOperationsAddress
    );
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolZKUSDDebtUpdated(uint256 _ZKUSDDebt);
    event ActivePoolETHBalanceUpdated(uint256 _ETH);

    // --- Functions ---
    function sendETH(address _account, uint256 _amount) external;
}
