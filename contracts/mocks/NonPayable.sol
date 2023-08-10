// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract NonPayable {
    bool isPayable;

    function setPayable(bool _isPayable) external {
        isPayable = _isPayable;
    }

    function forward(address _dest, bytes calldata _data) external payable {
        (bool success, bytes memory returnData) = _dest.call{value: msg.value}(
            _data
        );
        require(success, bytesToString(returnData));
    }

    function bytesToString(
        bytes memory input
    ) public pure returns (string memory) {
        uint256 length;
        for (uint256 i = 0; i < input.length; i++) {
            uint charCode = uint8(input[i]);
            if (charCode >= 0x20 && charCode <= 0x7E) {
                length++;
            }
        }

        bytes memory output = new bytes(length);
        uint256 index;
        for (uint256 i = 0; i < input.length; i++) {
            uint charCode = uint8(input[i]);
            if (charCode >= 0x20 && charCode <= 0x7E) {
                output[index++] = input[i];
            }
        }
        return string(output);
    }

    receive() external payable {
        require(isPayable);
    }
}
