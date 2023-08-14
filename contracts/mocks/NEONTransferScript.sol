// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract NEONTransferScript {
    function transferNEON(
        address _recipient,
        uint256 _amount
    ) external returns (bool) {
        (bool success, ) = _recipient.call{value: _amount}("");
        return success;
    }
}
