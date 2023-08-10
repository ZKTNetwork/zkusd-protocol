// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WrapToken is ERC20 {
    constructor() ERC20("Wrapped Token", "WT") {}

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) public {
        _burn(msg.sender, wad);
        (bool success, ) = payable(msg.sender).call{value: wad}("");
        require(success, "failed to withdraw");
    }
}
