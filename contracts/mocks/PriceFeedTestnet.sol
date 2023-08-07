// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IPriceFeed.sol";

contract PriceFeedTestnet is IPriceFeed {
    uint256 private _price = 200 * 1e18;

    uint256 public lastGoodPrice;

    // --- Dependency setters ---
    function setAddresses(bytes4, address) external {}

    // View price getter for simplicity in tests
    function getPrice() external view returns (uint256) {
        return _price;
    }

    function fetchPrice() external override returns (uint256) {
        emit LastGoodPriceUpdated(_price);
        lastGoodPrice = _price;
        return lastGoodPrice;
    }

    function setPrice(uint256 price) external returns (bool) {
        _price = price;
        lastGoodPrice = _price;

        return true;
    }
}
